const PROCESSING_URL = process.env.PROCESSING_URL?.replace(/\/$/, "");
const PROCESSING_API_KEY = process.env.PROCESSING_API_KEY;

export const processingConfigured = Boolean(PROCESSING_URL && PROCESSING_API_KEY);

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${PROCESSING_API_KEY}`, "Content-Type": "application/json" };
}

async function processingFetch(path: string, init?: RequestInit) {
  if (!PROCESSING_URL) throw new Error("PROCESSING_URL is not configured");
  const res = await fetch(`${PROCESSING_URL}${path}`, {
    ...init,
    headers: { ...authHeader(), ...((init?.headers as Record<string, string>) ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Processing machine ${init?.method ?? "GET"} ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export interface TriggerBasemapTilingPayload {
  basemap_id: number;
  download_url: string;
  callback_url: string;
  min_zoom?: number;
  max_zoom?: number;
  // Ground truth for the processor's geo_sanity CRS verification (same field
  // shape as TriggerRunPayload.farm_centroid above) — required here, unlike
  // pipeline runs, since every Basemap has a farm_id by construction.
  farm_centroid: { lat: number; lng: number } | null;
  // Uploader-named source CRS (Basemaps.crs_override_epsg) — the processor
  // reprojects from this instead of guessing, still sanity-checked against
  // farm_centroid. Omitted/null = auto-detect as before.
  crs_override_epsg?: number | null;
}

// Planned Changes items 6+7 (docs/raster-tiling-plan.md). First-party
// operation on the processing machine, fire-and-forget: the processor accepts
// the job and reports back to callback_url when tiling finishes.
export async function triggerBasemapTiling(payload: TriggerBasemapTilingPayload): Promise<void> {
  await processingFetch(`/basemaps/${payload.basemap_id}/tile`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface TriggerYieldCleanPayload {
  yield_run_id: number;
  download_url: string;
  callback_url: string;
  farm_id: number;
  // The farm's Fields — yieldclean splits the card by these polygons and
  // carries `id` into every output as field_key. geometry is the raw GeoJSON
  // string as stored.
  boundaries: { id: number; Name: string; geometry: string | null }[];
  // GeoDaRT context rasters (Context_Rasters rows) for regression kriging of
  // the yield map; url is the /api/files/context/<file> route, fetched with
  // the processor's FDL bearer. Empty = ordinary kriging only.
  context_rasters: { id: number; product: string; capture_date: string | null; url: string }[];
}

// Yield-card cleaning (lib/yield-runs.ts): PipelineProcessor runs the lab's
// yieldclean image on the card zip (its yield_clean.py) and calls back
// yield_completed / yield_failed. A 503 here means the processor has no
// image/plugin configured; lib/yield-runs.ts shows its detail to the user.
export async function triggerYieldClean(payload: TriggerYieldCleanPayload): Promise<void> {
  await processingFetch(`/yield-runs/${payload.yield_run_id}/clean`, { method: "POST", body: JSON.stringify(payload) });
}

// Machine vision (lib/vision.ts, GitHub issue #4): PipelineProcessor embeds
// each source with DINOv3 (cached there), fits the light head on the labels
// and calls back vision_completed / vision_failed. Geometry is pixels for a
// photo source, lon/lat for an ortho.
export interface TriggerVisionRunPayload {
  vision_run_id: number;
  callback_url: string;
  model?: string | null;
  head: "knn" | "logreg";
  k: number;
  threshold: number;
  min_patches: number;
  gsd_m: number | null;
  max_side: number | null;
  /** Ortho point labels cover patches within this radius (metres); 0 = one patch. */
  point_radius_m: number;
  classes: { id: number; name: string; background: boolean }[];
  sources: { key: string; kind: "photo" | "ortho"; download_url: string; sha256: string | null; crs_epsg: number | null }[];
  labels: { source_key: string; class_id: number; geom: unknown }[];
}

export async function triggerVisionRun(payload: TriggerVisionRunPayload): Promise<void> {
  await processingFetch(`/vision-runs/${payload.vision_run_id}/run`, { method: "POST", body: JSON.stringify(payload) });
}

/** Models installed on the processor (VISION_MODELS_DIR), or null if unreachable. */
export async function fetchVisionModels(): Promise<{ configured: boolean; default: string; models: string[] } | null> {
  if (!processingConfigured) return null;
  try {
    return await processingFetch("/vision/models", { signal: AbortSignal.timeout(5000) });
  } catch {
    return null;
  }
}

// On-demand NAIP imagery tile (PipelineProcessor's GET /naip/tiles/{z}/{x}/{y},
// naip_tiles.py) for the sampling-map bounding-box basemap feature. Returns
// null when NAIP has no coverage there (processor 404); throws on any other
// failure (502 = Planetary Computer unreachable) so a transient outage isn't
// mistaken for "no imagery" and cached by the browser as a missing tile.
export async function fetchNaipTile(
  z: number,
  x: number,
  y: number,
  year?: number
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  if (!PROCESSING_URL) throw new Error("PROCESSING_URL is not configured");
  const qs = year ? `?year=${year}` : "";
  const res = await fetch(`${PROCESSING_URL}/naip/tiles/${z}/${x}/${y}${qs}`, {
    headers: { Authorization: `Bearer ${PROCESSING_API_KEY}` },
    signal: AbortSignal.timeout(60_000), // a cold first tile can take ~20 s
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Processing machine GET /naip/tiles → ${res.status}`);
  return { body: await res.arrayBuffer(), contentType: res.headers.get("content-type") ?? "image/jpeg" };
}

export interface TriggerNaipPackagePayload {
  // Sampling_Maps.id — one package per map.
  package_id: number;
  callback_url: string;
  bbox: [number, number, number, number]; // [west, south, east, north]
  min_zoom: number;
  max_zoom: number;
}

// Asks PipelineProcessor to render every NAIP tile in a sampling map's box into
// an MBTiles file (naip_package.py). Fire-and-forget like triggerBasemapTiling:
// the processor accepts the job and calls callback_url (naip_package_completed /
// naip_package_failed) when done.
export async function triggerNaipPackage(payload: TriggerNaipPackagePayload): Promise<void> {
  await processingFetch("/naip/packages", { method: "POST", body: JSON.stringify(payload) });
}

// ── Declarative pipelines (PipelineProcessor /v2/*, docs/pipeline-requests-plan.md phase 2) ──

export interface CatalogParam {
  name: string; type: string; default: unknown; help?: string; min?: number; max?: number; choices?: string[];
}
export interface CatalogPipeline {
  key: string; version: number; name: string; status: string; description: string;
  inputs: { name: string; kind: string; required: boolean; data_product?: string; note?: string }[];
  outputs: { name: string; kind: string; note?: string }[];
  params: CatalogParam[];
  steps: { id: string; op: string; optional: boolean }[];
}
export interface PipelineCatalog {
  pipelines: CatalogPipeline[];
  ops: { name: string; version: number; doc: string; resources: string }[];
  errors: Record<string, string>;
}

/** The processor's runnable pipelines, or null if it isn't configured/reachable. */
export async function fetchPipelineCatalog(): Promise<PipelineCatalog | null> {
  if (!processingConfigured) return null;
  try {
    return await processingFetch("/v2/catalog", { signal: AbortSignal.timeout(8000) });
  } catch (err) {
    console.error("[pipeline catalog]", err);
    return null;
  }
}

export interface TriggerCatalogRunPayload {
  key: string;
  version: number;
  callback_url: string;
  farm_id: number | null;
  inputs: Record<string, Record<string, unknown> | null>;
  params: Record<string, unknown>;
}

export async function triggerCatalogRun(runId: number, payload: TriggerCatalogRunPayload): Promise<void> {
  await processingFetch(`/v2/runs/${runId}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}


// ── Vision source copies + full-resolution chips (PipelineProcessor vision_sources.py) ──

export interface VisionSourceRef {
  key: string;
  kind: "ortho" | "photo";
  download_url: string;
  sha256: string | null;
  crs_epsg: number | null;
}

/** Asks the processor to download a source now (the label checker's chips need it). */
export async function prepareVisionSource(src: VisionSourceRef): Promise<{ state: string }> {
  return processingFetch("/vision/sources/prepare", { method: "POST", body: JSON.stringify(src) });
}

/**
 * A full-resolution PNG chip around lon/lat. Returns the processor's raw
 * response: 200 image/png with X-Chip-Bounds, or 409 {detail: state} when the
 * source isn't downloaded yet. Throws only when the processor is unreachable.
 */
export async function fetchVisionChip(opts: { key: string; sha256: string | null; lon: number; lat: number; sizeM: number }): Promise<Response> {
  if (!PROCESSING_URL) throw new Error("PROCESSING_URL is not configured");
  const q = new URLSearchParams({ lon: String(opts.lon), lat: String(opts.lat), size_m: String(opts.sizeM) });
  if (opts.sha256) q.set("sha256", opts.sha256);
  return fetch(`${PROCESSING_URL}/vision/sources/${encodeURIComponent(opts.key)}/chip?${q}`, {
    headers: authHeader(), signal: AbortSignal.timeout(30_000),
  });
}
