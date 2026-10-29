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

// Natural-language context about the dataset a pipeline processes, so the
// LLM script-wiring step (and a human reviewer) knows what the data means and
// how the lab wants it handled — not just the script source + a filename.
export interface PipelineDataContext {
  pipeline_description: string | null;
  data_table: {
    name: string;
    description: string | null;
    data_processing_instructions: string | null;
    columns: { label: string; field_type: string }[];
    // Raw text of an attached example table (real rows), capped — see
    // SAMPLE_PREVIEW_MAX_CHARS in app/api/pipelines/route.ts.
    sample_preview: string | null;
  } | null;
}

export interface RegisterPipelinePayload {
  pipeline_id: number;
  name: string;
  match_table: string | null; // null for target_kind = "drone_flight" pipelines
  sample_dataset_url: string;
  script_url: string;
  model_url: string | null;
  callback_url: string;
  // When true, per-farm spatial-context rasters (terrain/soil/imagery) are
  // available on the server and the wiring LLM should account for them —
  // e.g. spatially-informed interpolation (regression kriging, ML).
  use_spatial_context?: boolean;
  data_context?: PipelineDataContext | null;
}

// Kicks off registration on the processing machine: it downloads the sample
// dataset/script/model, has the LLM wire the script into a runnable command,
// test-runs it against the sample dataset, and calls `callback_url` with the result.
export async function registerPipeline(
  payload: RegisterPipelinePayload
): Promise<{ external_pipeline_id: string }> {
  return processingFetch("/pipelines", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface TriggerRunPayload {
  run_id: number;
  callback_url: string;
  // Exactly one of these two — input_file_url for the normal upload-matched/re-test
  // path, drone_flight_record_id for a manual per-flight organize run (see
  // PipelineRun.target_drone_flight_id and Item90_Processing_Pipeline_Scope.md).
  input_file_url?: string;
  drone_flight_record_id?: number;
  // Operator instruction for this run only — the processor re-runs its LLM
  // wiring step with this folded in and executes the one-off command instead
  // of the pipeline's stored one ("set output raster resolution to 5m").
  prompt?: string;
  // The resolved farm's geocoded location (Farms.latitude/longitude), when the
  // run resolved to one (see lib/pipeline-farm.ts) — ground truth for the
  // processor's geo_sanity CRS verification, not fed into the pipeline script.
  farm_centroid?: { lat: number; lng: number };
}

export async function triggerPipelineRun(
  externalPipelineId: string,
  payload: TriggerRunPayload
): Promise<{ external_job_id: string }> {
  return processingFetch(`/pipelines/${encodeURIComponent(externalPipelineId)}/run`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deletePipeline(externalPipelineId: string) {
  return processingFetch(`/pipelines/${encodeURIComponent(externalPipelineId)}`, {
    method: "DELETE",
  });
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
// operation on the processing machine — not routed through the LLM-wiring /
// sandbox pipeline machinery, since this is our own code, not a user script.
// Same fire-and-forget shape as triggerPipelineRun: the processor accepts the
// job and reports back to callback_url when tiling finishes.
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
}

// Yield-card cleaning (lib/yield-runs.ts): PipelineProcessor runs the lab's
// yieldclean image on the card zip (its yield_clean.py) and calls back
// yield_completed / yield_failed. A 503 here means the processor has no
// image/plugin configured; lib/yield-runs.ts shows its detail to the user.
export async function triggerYieldClean(payload: TriggerYieldCleanPayload): Promise<void> {
  await processingFetch(`/yield-runs/${payload.yield_run_id}/clean`, { method: "POST", body: JSON.stringify(payload) });
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
