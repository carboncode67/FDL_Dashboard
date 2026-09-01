/**
 * Minimal client for the ScienceVersa GeoDaRT API (spatial-context rasters).
 *
 * GeoDaRT is itself the async job runner: submit → poll /multiproduct/jobs/{id} →
 * GET a signed zip. GeoDaRT does the AOI clipping and COG conversion, so nothing
 * here needs GDAL / geo libraries. See the `geodart-api` memory note and
 * FarmersDatabase/Client/fetch_spatial_context.py for the full contract.
 */

const GEODART_URL = (
  process.env.GEODART_URL ?? "https://geodart-api.farmersdatalab.scienceversa.com"
).replace(/\/$/, "");

// GeoDaRT has no account/key system yet — submit only needs *some* guid + email.
// Swap in a real value via env once GeoDaRT issues credentials.
const PLACEHOLDER_GUID = "00000000-0000-0000-0000-000000000000";
const PLACEHOLDER_EMAIL = "ofe-pipeline@farmersdatalab.org";

const USER_GUID = process.env.GEODART_USER_GUID || PLACEHOLDER_GUID;
const USER_EMAIL = process.env.GEODART_USER_EMAIL || PLACEHOLDER_EMAIL;
const PASSWORD_HASH = process.env.GEODART_PASSWORD_HASH || null;

export const geodartConfigured = Boolean(GEODART_URL);
export const geodartHasKey = Boolean(PASSWORD_HASH);

// product code -> needs a GeoDaRT key (user_password_hash) that isn't issued yet
export const PRODUCTS = {
  POLARIS: { label: "POLARIS soil (30 m)", needsKey: false, timeVarying: false },
  USGS3DEP_10m: { label: "USGS 3DEP terrain (10 m)", needsKey: false, timeVarying: false },
  USDroughtMonitor: { label: "US Drought Monitor", needsKey: false, timeVarying: true },
  SOLUS: { label: "SOLUS soil (100 m)", needsKey: true, timeVarying: false },
  Sentinel2: { label: "Sentinel-2 imagery", needsKey: true, timeVarying: true },
} as const;

export type ProductCode = keyof typeof PRODUCTS;
export const ALL_PRODUCTS = Object.keys(PRODUCTS) as ProductCode[];
export const NO_KEY_PRODUCTS = ALL_PRODUCTS.filter((p) => !PRODUCTS[p].needsKey);
export const DEFAULT_PRODUCTS = NO_KEY_PRODUCTS;

export function isProductCode(v: string): v is ProductCode {
  return v in PRODUCTS;
}

function base64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

async function gdFetch(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(`${GEODART_URL}${path}`, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

export interface SubmitJobArgs {
  aoiRing: [number, number][]; // bare [[lon,lat],...] ring
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  products: ProductCode[];
  exportFormat?: "GeoTIFF" | "COG" | "NETCDF";
}

export interface SubmitJobResult {
  jobId: string;
  requestId: string;
}

export async function submitJob(args: SubmitJobArgs): Promise<SubmitJobResult> {
  const body: Record<string, unknown> = {
    aoi_coords: args.aoiRing,
    aoi_projection: "EPSG:4326",
    export_crs: "EPSG:4326",
    export_file_format: args.exportFormat ?? "COG",
    clip_to_aoi: true,
    local_save_dir_path_base64: base64("geodart"),
    start_date: args.startDate,
    end_date: args.endDate,
    selections: args.products.map((p) => ({ product_name: p })),
    user_id_guid: USER_GUID,
    user_email: USER_EMAIL,
  };
  if (PASSWORD_HASH) body.user_password_hash = PASSWORD_HASH;

  const res = await gdFetch(
    "/multiproduct/submit",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    120_000,
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`GeoDaRT submit ${res.status}: ${text.slice(0, 400)}`);
  const json = JSON.parse(text);
  if (!json.job_id) throw new Error(`GeoDaRT submit: no job_id in response (${text.slice(0, 200)})`);
  return { jobId: String(json.job_id), requestId: String(json.request_id ?? json.job_id) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GeodartJob = Record<string, any>;

export async function getJob(jobId: string): Promise<GeodartJob> {
  const res = await gdFetch(`/multiproduct/jobs/${encodeURIComponent(jobId)}`, {}, 60_000);
  if (!res.ok) throw new Error(`GeoDaRT job ${jobId}: ${res.status}`);
  return res.json();
}

export const TERMINAL_STATUSES = new Set(["SUCCESS", "FAILURE", "REVOKED"]);

export interface ProductResult {
  ok: boolean;
  detail?: string;
}

/** Per-product ok/error, folding in POLARIS's `ok:true` + nested `{Status:"error"}`. */
export function parseProductResults(job: GeodartJob): Record<string, ProductResult> {
  const rp = job?.result_payload ?? {};
  const out: Record<string, ProductResult> = {};
  for (const [key, val] of Object.entries(rp)) {
    if (key === "_job" || typeof val !== "object" || val === null) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = val as any;
    let ok = Boolean(v.ok);
    // POLARIS-style: ok:true but a nested {Status:"error"} — treat as a failure.
    const nested = v.result;
    let errText: unknown = ok ? undefined : v.error;
    if (ok && nested && typeof nested === "object" && String((nested as { Status?: string }).Status ?? "").toLowerCase() === "error") {
      ok = false;
      errText = (nested as { Exception?: string }).Exception ?? "job reported an error";
    }
    const detail =
      errText == null ? undefined : (typeof errText === "string" ? errText : JSON.stringify(errText)).slice(0, 500);
    out[key] = detail ? { ok, detail } : { ok };
  }
  return out;
}

export function jobDownloadLink(job: GeodartJob): string | null {
  return job?.result_payload?._job?.download_link ?? null;
}
