// Browser half of the presigned multipart basemap upload (lib/s3-uploads.ts,
// docs/garage-s3-upload-plan.md). The file goes straight from the browser to
// the S3 bucket in parts, several at a time; the Dashboard only signs part URLs
// and assembles the result. A failed part is retried on its own, and an
// interrupted upload resumes: the upload id is kept in localStorage keyed on
// the file's name, size and mtime, so dropping the same file again on the same
// farm carries on from the parts storage already has.
//
// File.slice() is lazy, so a multi-GB file is never read into memory.

const CONCURRENCY = 4;
const SIGN_BATCH = 16;
const MAX_ATTEMPTS = 6;
const URL_REFRESH_MS = 45 * 60 * 1000; // part URLs live 1 h server-side

export interface MultipartProgress {
  loaded: number;
  total: number;
  resumed: boolean;
}

export interface BasemapUploadFields {
  farmId: number;
  displayName?: string;
  crsOverrideEpsg?: string;
}

export class UploadCancelled extends Error {
  constructor() {
    super("Upload cancelled");
  }
}

interface UploadInfo {
  id: number;
  part_size: number;
  part_count: number;
  bytes: number;
}

function storageKey(farmId: number, f: File): string {
  return `fdl-s3-upload:${farmId}:${f.name}:${f.size}:${f.lastModified}`;
}

function loadSaved(key: string): number | null {
  try {
    const v = localStorage.getItem(key);
    const n = v ? parseInt(v, 10) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function save(key: string, id: number | null) {
  try {
    if (id == null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(id));
  } catch {
    /* private mode etc. — resume just won't be available */
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(json.error ?? `Request failed (${res.status})`) as Error & { status?: number };
    e.status = res.status;
    throw e;
  }
  return json as T;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new UploadCancelled());
    }, { once: true });
  });

// XHR rather than fetch: fetch has no upload progress events.
function putPart(url: string, body: Blob, onProgress: (sent: number) => void, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(Object.assign(new Error(`Part upload failed (${xhr.status})`), { status: xhr.status }));
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.ontimeout = () => reject(new Error("Timed out"));
    const onAbort = () => xhr.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    xhr.onabort = () => reject(new UploadCancelled());
    xhr.onloadend = () => signal.removeEventListener("abort", onAbort);
    xhr.send(body);
  });
}

/**
 * Uploads a basemap GeoTIFF to the bucket and creates its Basemaps row.
 * Resolves with the completion response ({ ok, id, tiling_status }).
 * Throws UploadCancelled if `signal` aborts; the upload is then cancelled
 * server-side too. Any other failure (a part that kept failing, a network
 * outage) stops every part and leaves the upload resumable: drop the same
 * file again. Closing the tab does the same.
 */
export async function uploadBasemapMultipart(
  file: File,
  fields: BasemapUploadFields,
  opts: { onProgress?: (p: MultipartProgress) => void; signal: AbortSignal },
): Promise<{ ok: true; id: number; tiling_status: string }> {
  const { signal } = opts;
  const key = storageKey(fields.farmId, file);

  // Resume, or start fresh.
  let info: UploadInfo | null = null;
  const done = new Set<number>();
  let resumed = false;
  const savedId = loadSaved(key);
  if (savedId != null) {
    try {
      const r = await api<UploadInfo & { status: string; parts: { part_number: number }[] }>(`/api/s3-uploads/${savedId}/parts`);
      if (r.status === "uploading" && r.bytes === file.size) {
        info = r;
        r.parts.forEach((p) => done.add(p.part_number));
        resumed = done.size > 0;
      }
    } catch {
      /* gone, expired or someone else's — start over */
    }
    if (!info) save(key, null);
  }
  if (!info) {
    info = await api<UploadInfo>("/api/s3-uploads", {
      method: "POST",
      body: JSON.stringify({
        farm_id: fields.farmId,
        filename: file.name,
        size: file.size,
        display_name: fields.displayName || undefined,
        crs_override_epsg: fields.crsOverrideEpsg || undefined,
      }),
    });
    save(key, info.id);
  }
  const u = info;

  const partRange = (n: number): [number, number] => [(n - 1) * u.part_size, Math.min(n * u.part_size, file.size)];
  const todo: number[] = [];
  let doneBytes = 0;
  for (let n = 1; n <= u.part_count; n++) {
    if (done.has(n)) {
      const [a, b] = partRange(n);
      doneBytes += b - a;
    } else todo.push(n);
  }

  const inFlight = new Map<number, number>();
  const report = () => {
    let sent = doneBytes;
    inFlight.forEach((v) => (sent += v));
    opts.onProgress?.({ loaded: Math.min(sent, file.size), total: file.size, resumed });
  };
  report();

  // Signed URLs, fetched lazily in batches and refreshed before they expire.
  const urls = new Map<number, { url: string; at: number }>();
  let signing: Promise<void> | null = null;
  async function urlFor(n: number, force = false): Promise<string> {
    const cached = urls.get(n);
    if (!force && cached && Date.now() - cached.at < URL_REFRESH_MS) return cached.url;
    while (signing) await signing;
    const again = urls.get(n);
    if (!force && again && Date.now() - again.at < URL_REFRESH_MS) return again.url;
    const batch = [n, ...queue.filter((m) => m !== n && !urls.has(m)).slice(0, SIGN_BATCH - 1)];
    signing = api<{ parts: { part_number: number; url: string }[] }>(`/api/s3-uploads/${u.id}/sign`, {
      method: "POST",
      body: JSON.stringify({ part_numbers: batch }),
    }).then((r) => {
      const at = Date.now();
      r.parts.forEach((p) => urls.set(p.part_number, { url: p.url, at }));
    }).finally(() => {
      signing = null;
    });
    await signing;
    return urls.get(n)!.url;
  }

  // One failing part stops the rest; only the caller's signal means "cancel".
  const inner = new AbortController();
  if (signal.aborted) inner.abort();
  else signal.addEventListener("abort", () => inner.abort(), { once: true });

  const queue = [...todo];
  async function worker() {
    for (;;) {
      if (inner.signal.aborted) throw new UploadCancelled();
      const n = queue.shift();
      if (n == null) return;
      const [a, b] = partRange(n);
      let lastErr: unknown;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          // 403 = the signature expired or was refused: re-sign before retrying.
          const url = await urlFor(n, attempt > 1 && (lastErr as { status?: number })?.status === 403);
          inFlight.set(n, 0);
          await putPart(url, file.slice(a, b), (sent) => {
            inFlight.set(n, sent);
            report();
          }, inner.signal);
          inFlight.delete(n);
          urls.delete(n);
          doneBytes += b - a;
          report();
          lastErr = null;
          break;
        } catch (e) {
          inFlight.delete(n);
          report();
          if (e instanceof UploadCancelled || inner.signal.aborted) throw new UploadCancelled();
          lastErr = e;
          if (attempt < MAX_ATTEMPTS) await sleep(Math.min(30_000, 1000 * 2 ** (attempt - 1)), inner.signal);
        }
      }
      if (lastErr) throw lastErr;
    }
  }

  const results = await Promise.allSettled(
    Array.from({ length: Math.min(CONCURRENCY, Math.max(1, todo.length)) }, () =>
      worker().catch((e) => {
        inner.abort();
        throw e;
      }),
    ),
  );
  if (signal.aborted) {
    await fetch(`/api/s3-uploads/${u.id}`, { method: "DELETE" }).catch(() => {});
    save(key, null);
    throw new UploadCancelled();
  }
  const failure = results.find(
    (r): r is PromiseRejectedResult => r.status === "rejected" && !(r.reason instanceof UploadCancelled),
  );
  if (failure) throw failure.reason;

  const result = await api<{ ok: true; id: number; tiling_status: string }>(`/api/s3-uploads/${u.id}/complete`, { method: "POST" });
  save(key, null);
  return result;
}
