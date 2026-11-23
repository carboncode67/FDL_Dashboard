import { NextResponse } from "next/server";
import fs from "fs";
import crypto from "crypto";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline as streamPipeline } from "stream/promises";
import yauzl from "yauzl";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { processingConfigured, triggerYieldClean } from "@/lib/processing";
import { keepAsFarmDocument } from "@/lib/farm-document-copy";
import { BASEMAP_SOURCES_DIR, BASEMAP_TILES_DIR, downloadTileArchive, extractTiles } from "@/lib/basemap-tiles";
import { requestContextFetch } from "@/lib/context-fetch";
import { geodartHasKey, type ProductCode } from "@/lib/geodart";

// Yield-card cleaning (migration 090). The unified farm upload box (and OFE's
// port of it) sends a zipped CNH CN1 card to receiveYieldCardUpload()
// (lib/farm-uploads.ts), which stores it and calls startYieldRun() here.
// PipelineProcessor runs the lab's yieldclean image on it (its
// yield_clean.py) and calls back POST /api/yield-runs/webhook →
// ingestYieldResults(): the kept points become a Farm_Layers overlay
// (coloured by yield quintile) and the full results archive (cleaned
// gpkg/csv, QA report, field summary) a farm Document.
//
//
// Yield maps (migration 094): the processor also kriges each field's kept
// yield and sends back a coloured, tiled map, kept as a Basemap (basemap_id)
// so both dashboards' raster lists show it like any other. The farm's GeoDaRT
// context rasters for the season go along in the trigger (contextForRun), for
// regression kriging; with no Sentinel-2 for the season the run asks for a
// fetch once (context_job_id) and is re-sent when it lands
// (resendYieldRunsForContextJob, called from lib/context-fetch.ts).
//
// Status: pending (not accepted by the processor — e.g. PROCESSING_URL unset
// or it was unreachable) | processing | ready | failed. Same lifecycle and
// Retry affordance as a Basemap's tiling_status.

export const YIELD_SOURCES_DIRNAME = "yield-sources";

/** The first `*.cn1` folder name in the zip (e.g. "261016I0"), or null. */
export function cn1CardName(zipPath: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("bad zip"));
      zip.on("error", reject);
      zip.on("end", () => resolve(null));
      zip.on("entry", (entry: yauzl.Entry) => {
        const seg = entry.fileName.split("/").find((s) => /\.cn1$/i.test(s));
        if (seg) {
          zip.close();
          resolve(seg.replace(/\.cn1$/i, ""));
        } else {
          zip.readEntry();
        }
      });
      zip.readEntry();
    });
  });
}

// processingFetch errors read "Processing machine POST /x → 503: {"detail":"…"}" —
// surface FastAPI's detail (e.g. "yieldclean isn't set up") as-is.
function processorError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/→ \d+: ([\s\S]*)$/);
  if (m) {
    try {
      const detail = JSON.parse(m[1])?.detail;
      if (typeof detail === "string") return detail;
    } catch {}
  }
  return "Failed to reach the processing machine";
}

/**
 * (Re)sends a run to PipelineProcessor. Leaves it "pending" when no processing
 * machine is configured; "processing" once the processor accepts it; "failed"
 * with the processor's reason otherwise. Boundaries are the farm's Fields, so
 * yieldclean splits the card by polygon and tags each point with the Field id.
 */
export async function startYieldRun(runId: number): Promise<void> {
  const run = await prisma.yieldRun.findUnique({ where: { id: runId } });
  if (!run) return;
  await prisma.yieldRun.update({ where: { id: run.id }, data: { status: "pending", error_message: null } });
  if (!processingConfigured) return;

  const fields = await prisma.field.findMany({
    where: { Farms_id: run.farm_id, geometry: { not: null } },
    select: { id: true, Name: true, geometry: true },
  });
  const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
  const context = await contextForRun(run, baseUrl);
  try {
    await triggerYieldClean({
      yield_run_id: run.id,
      download_url: `${baseUrl}/api/files/${YIELD_SOURCES_DIRNAME}/${run.source_filename}`,
      callback_url: `${baseUrl}/api/yield-runs/webhook`,
      farm_id: run.farm_id,
      boundaries: fields.map((f) => ({ id: f.id, Name: f.Name ?? `Field ${f.id}`, geometry: f.geometry })),
      context_rasters: context,
    });
  } catch (err) {
    console.error("[yield run] trigger failed", err);
    await prisma.yieldRun.update({ where: { id: run.id }, data: { status: "failed", error_message: processorError(err) } });
    return;
  }
  // Guarded: a fast job's webhook may already have set ready/failed.
  await prisma.yieldRun.updateMany({ where: { id: run.id, status: "pending" }, data: { status: "processing" } });
}

/**
 * The season a card was most likely harvested in, from its upload date: an
 * upload from April on is this year's harvest, one in Jan–Mar last year's.
 * Only a window for picking imagery — the processor's context.py keeps just
 * the Sentinel-2 dates before each field's first harvest record.
 */
function seasonWindow(uploaded: Date): { start: string; end: string } {
  const y = uploaded.getUTCMonth() >= 3 ? uploaded.getUTCFullYear() : uploaded.getUTCFullYear() - 1;
  const yearEnd = new Date(`${y}-12-31T00:00:00Z`);
  const end = uploaded < yearEnd ? uploaded : yearEnd;
  return { start: `${y}-03-01`, end: end.toISOString().slice(0, 10) };
}

const STATIC_CONTEXT = ["USGS3DEP_10m", "POLARIS"] as const;

/**
 * The farm's context rasters for regression kriging: Sentinel-2 dates in the
 * run's season, and the newest fetch's 3DEP and POLARIS files. When the
 * season has no Sentinel-2 (or a static product is missing), asks GeoDaRT for
 * what's missing, once per run; the run goes ahead now with what there is.
 */
/**
 * A farm's context rasters for the season of `when` (seasonWindow): its
 * Sentinel-2 dates, plus the newest fetch of each static product, in the
 * {id, product, capture_date, url} shape PipelineProcessor stages. `missing`
 * = products with nothing on file (Sentinel-2 only counts with a GeoDaRT key).
 * Shared by yield runs and declarative pipelines' context_rasters input.
 */
export async function selectContextRasters(farmId: number, when: Date, baseUrl: string) {
  const window = seasonWindow(when);
  const s2 = await prisma.contextRaster.findMany({
    where: {
      farm_id: farmId,
      product: "Sentinel2",
      capture_date: { gte: new Date(`${window.start}T00:00:00Z`), lte: new Date(`${window.end}T00:00:00Z`) },
    },
    orderBy: { capture_date: "asc" },
  });
  const statics = [];
  const missing: ProductCode[] = [];
  for (const product of STATIC_CONTEXT) {
    const newest = await prisma.contextRaster.findFirst({ where: { farm_id: farmId, product }, orderBy: { job_id: "desc" } });
    if (!newest) {
      missing.push(product);
      continue;
    }
    statics.push(...(await prisma.contextRaster.findMany({ where: { farm_id: farmId, product, job_id: newest.job_id } })));
  }
  if (!s2.length && geodartHasKey) missing.push("Sentinel2");
  const rasters = [...s2, ...statics].map((r) => ({
    id: r.id,
    product: r.product,
    capture_date: r.capture_date ? r.capture_date.toISOString().slice(0, 10) : null,
    url: `${baseUrl}/api/files/context/${r.filename}`,
  }));
  return { rasters, missing, window };
}

async function contextForRun(
  run: { id: number; farm_id: number; created_at: Date; context_job_id: number | null; uploaded_by_id: string | null },
  baseUrl: string,
) {
  const { rasters, missing, window: win } = await selectContextRasters(run.farm_id, run.created_at, baseUrl);

  if (missing.length && run.context_job_id == null) {
    try {
      const job = await requestContextFetch({
        farmId: run.farm_id,
        products: missing,
        startDate: win.start,
        endDate: win.end,
        requestedBy: run.uploaded_by_id,
      });
      await prisma.yieldRun.update({ where: { id: run.id }, data: { context_job_id: job.id } });
    } catch (err) {
      // No geometry etc. — ordinary kriging only; not worth failing the run.
      console.error(`[yield run] ${run.id}: context fetch not requested`, err);
    }
  }

  return rasters;
}

/** Re-sends the finished runs that asked for this context fetch, once. */
export async function resendYieldRunsForContextJob(jobId: number): Promise<void> {
  const runs = await prisma.yieldRun.findMany({
    where: { context_job_id: jobId, status: { in: ["ready", "failed"] } },
    select: { id: true },
  });
  for (const r of runs) await startYieldRun(r.id);
}

export interface YieldMapPayload {
  error?: string;
  unit?: string;
  legend?: { color: string; min: number; max: number }[];
  crs_epsg?: number | null;
  crs_status?: string | null;
  maps?: number;
  footprint?: GeoJSON.Polygon | null;
  min_zoom?: number;
  max_zoom?: number;
  source_url?: string;
  tile_archive_url?: string;
  interpolation?: unknown[];
  context_rasters?: number;
}

export interface YieldWebhookPayload {
  event: "yield_completed" | "yield_failed";
  yield_run_id: number;
  preset?: string;
  yield_unit?: string;
  kept_points?: number;
  shown_points?: number;
  fields?: unknown[];
  version?: string | null;
  points_url?: string;
  results_url?: string;
  error_message?: string;
  // Absent/null = the processor didn't interpolate (older build, or off).
  map?: YieldMapPayload | null;
}

// Bearer PROCESSING_API_KEY, the secret PipelineProcessor's _check_auth expects —
// same as the basemap webhook's tile-archive download.
export async function fetchFromProcessor(url: string): Promise<Response> {
  const apiKey = process.env.PROCESSING_API_KEY;
  const res = await fetch(url, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} });
  if (!res.ok || !res.body) throw new Error(`download failed: ${res.status} ${url}`);
  return res;
}

/** Removes a Documents row and its file under DATA_DIR/documents/. */
export async function deleteFarmDocument(id: number): Promise<void> {
  const doc = await prisma.document.findUnique({ where: { id }, select: { filename: true } });
  if (!doc) return;
  await prisma.document.delete({ where: { id } });
  const dataDir = process.env.DATA_DIR ?? "./upload-data";
  await fs.promises.rm(path.join(dataDir, "documents", path.basename(doc.filename)), { force: true });
}

/** Removes a yield map Basemap: its row, tiles and source GeoTIFF. */
export async function deleteYieldMapBasemap(basemapId: number): Promise<void> {
  const bm = await prisma.basemap.findUnique({ where: { id: basemapId }, select: { source_filename: true } });
  if (!bm) return;
  await prisma.basemap.delete({ where: { id: basemapId } });
  await fs.promises.rm(path.join(BASEMAP_TILES_DIR, String(basemapId)), { recursive: true, force: true });
  await fs.promises.rm(path.join(BASEMAP_SOURCES_DIR, path.basename(bm.source_filename)), { force: true });
}

/**
 * Keeps a tiled raster the processor produced as a ready Basemap: the GeoTIFF
 * as its source (so Retile works) and the tile pyramid under basemap-tiles/.
 * Returns the new Basemap id; throws on a download/extract failure, after
 * cleaning up what it wrote. Used for yield maps and for declarative
 * pipelines' raster_tiles outputs.
 */
export async function ingestTiledRaster(opts: {
  farmId: number;
  uploadedById: string | null;
  filePrefix: string;
  originalFilename: string;
  displayName: string;
  map: Pick<YieldMapPayload, "source_url" | "tile_archive_url" | "footprint" | "crs_status" | "crs_epsg" | "min_zoom" | "max_zoom">;
}): Promise<number> {
  const { map } = opts;
  fs.mkdirSync(BASEMAP_SOURCES_DIR, { recursive: true });
  const sourceFilename = `${opts.filePrefix}-${Date.now()}.tif`;
  const sourcePath = path.join(BASEMAP_SOURCES_DIR, sourceFilename);
  const res = await fetchFromProcessor(map.source_url!);
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  await streamPipeline(
    Readable.fromWeb(res.body as import("stream/web").ReadableStream),
    async function* (src: AsyncIterable<Buffer>) {
      for await (const chunk of src) {
        hash.update(chunk);
        bytes += chunk.length;
        yield chunk;
      }
    },
    fs.createWriteStream(sourcePath),
  );

  const basemap = await prisma.basemap.create({
    data: {
      farm_id: opts.farmId,
      uploaded_by_id: opts.uploadedById,
      original_filename: opts.originalFilename,
      source_filename: sourceFilename,
      bytes: BigInt(bytes),
      sha256: hash.digest("hex"),
      display_name: opts.displayName,
      tiling_status: "tiling",
    },
  });
  const tmpZip = path.join(os.tmpdir(), `${opts.filePrefix}-tiles-${Date.now()}.zip`);
  try {
    await downloadTileArchive(map.tile_archive_url!, tmpZip);
    await extractTiles(tmpZip, path.join(BASEMAP_TILES_DIR, String(basemap.id)));
    await prisma.basemap.update({
      where: { id: basemap.id },
      data: {
        footprint: (map.footprint as object | null | undefined) ?? undefined,
        crs_status: map.crs_status ?? "ok",
        crs_epsg: map.crs_epsg ?? null,
        min_zoom: map.min_zoom ?? null,
        max_zoom: map.max_zoom ?? null,
        tile_dir: String(basemap.id),
        tiling_status: "ready",
      },
    });
    return basemap.id;
  } catch (err) {
    await deleteYieldMapBasemap(basemap.id).catch(() => {});
    throw err;
  } finally {
    fs.unlink(tmpZip, () => {});
  }
}

function ingestYieldMap(
  run: { id: number; farm_id: number; uploaded_by_id: string | null },
  base: string,
  map: YieldMapPayload,
): Promise<number> {
  return ingestTiledRaster({
    farmId: run.farm_id,
    uploadedById: run.uploaded_by_id,
    filePrefix: `yield-map-${run.id}`,
    originalFilename: `${base}_yield_map.tif`,
    displayName: `Yield map — ${base}${map.unit ? ` (${map.unit})` : ""}`,
    map,
  });
}

export async function ingestYieldResults(payload: YieldWebhookPayload): Promise<string> {
  const run = await prisma.yieldRun.findUnique({ where: { id: payload.yield_run_id } });
  if (!run) return "run_not_found";

  if (payload.event === "yield_failed") {
    await prisma.yieldRun.update({
      where: { id: run.id },
      data: { status: "failed", error_message: payload.error_message ?? "Yield cleaning failed" },
    });
    return "failed";
  }
  if (!payload.points_url || !payload.results_url) return "ignored";

  const tmpZip = path.join(os.tmpdir(), `yield-${run.id}-results-${Date.now()}.zip`);
  try {
    const geojson = (await (await fetchFromProcessor(payload.points_url)).json()) as GeoJSON.FeatureCollection;
    const res = await fetchFromProcessor(payload.results_url);
    await streamPipeline(Readable.fromWeb(res.body as import("stream/web").ReadableStream), fs.createWriteStream(tmpZip));

    const base = run.display_name || path.basename(run.original_filename, path.extname(run.original_filename));
    const thinned = payload.shown_points != null && payload.kept_points != null && payload.shown_points < payload.kept_points;
    const resultsDocumentId = await keepAsFarmDocument({
      farmId: run.farm_id,
      originalName: `${base}_yield_cleaned.zip`,
      description: `Cleaned yield (yieldclean${payload.version ? ` ${payload.version}` : ""}, ${payload.preset ?? "unknown"} preset) from ${run.original_filename}`,
      sourcePath: tmpZip,
    });

    // A retried run replaces its own earlier layer rather than stacking another.
    if (run.layer_id) await prisma.farmLayer.deleteMany({ where: { id: run.layer_id } });
    const layer = await prisma.farmLayer.create({
      data: {
        farm_id: run.farm_id,
        name: `Yield — ${base}${thinned ? " (sample)" : ""}`,
        geometry_kind: "point",
        feature_count: geojson.features.length,
        geojson: geojson as unknown as Prisma.InputJsonValue,
        original_filename: run.original_filename,
        source_epsg: 4326,
        document_id: run.source_document_id,
        uploaded_by_id: run.uploaded_by_id,
      },
    });

    // The map is extra: a failure here leaves the points and results in place
    // and records why in `interpolation`.
    let basemapId: number | null = null;
    let interpolation: Record<string, unknown> | null = null;
    const map = payload.map;
    if (map) {
      const { source_url: _s, tile_archive_url: _t, footprint: _f, ...info } = map;
      interpolation = info;
      if (!map.error && map.source_url && map.tile_archive_url) {
        try {
          basemapId = await ingestYieldMap(run, base, map);
        } catch (err) {
          console.error("[yield webhook] map ingestion failed", err);
          interpolation = { ...info, error: "Failed to ingest the yield map" };
        }
      }
    }
    // A re-run replaces its own earlier map, as with the points layer.
    if (run.basemap_id && run.basemap_id !== basemapId) {
      await deleteYieldMapBasemap(run.basemap_id).catch((err) => console.error("[yield webhook] old map cleanup", err));
    }
    // ...and its earlier results archive (re-sends after a context fetch would
    // otherwise pile up one Document per run).
    if (run.results_document_id && run.results_document_id !== resultsDocumentId) {
      await deleteFarmDocument(run.results_document_id).catch((err) => console.error("[yield webhook] old results cleanup", err));
    }

    await prisma.yieldRun.update({
      where: { id: run.id },
      data: {
        basemap_id: basemapId,
        interpolation: interpolation === null ? Prisma.DbNull : (interpolation as Prisma.InputJsonValue),
        status: "ready",
        error_message: null,
        preset: payload.preset ?? null,
        yield_unit: payload.yield_unit ?? null,
        kept_points: payload.kept_points ?? null,
        summary: (payload.fields ?? []) as Prisma.InputJsonValue,
        layer_id: layer.id,
        results_document_id: resultsDocumentId,
      },
    });
    return "ready";
  } catch (err) {
    console.error("[yield webhook] ingestion failed", err);
    await prisma.yieldRun.update({
      where: { id: run.id },
      data: { status: "failed", error_message: "Failed to ingest the cleaned yield results" },
    });
    return "ingestion_failed";
  } finally {
    fs.unlink(tmpZip, () => {});
  }
}

/** Not-yet-ready runs, in the shape the farm map's "Processing:" list takes. */
export function yieldRunToProcessing(r: { id: number; display_name: string | null; original_filename: string; status: string; error_message: string | null }) {
  return {
    id: r.id,
    kind: "yield" as const,
    label: `${r.display_name || r.original_filename} (yield)`,
    status: r.status,
    error: r.error_message,
  };
}

/** Retry route body. `farmId` set = 404 a run on another farm (the data route). */
export async function retryYieldRun(runId: number, farmId?: number): Promise<NextResponse> {
  if (!processingConfigured) {
    return NextResponse.json({ error: "No processing machine is configured (PROCESSING_URL)" }, { status: 503 });
  }
  const run = isNaN(runId) ? null : await prisma.yieldRun.findUnique({ where: { id: runId } });
  if (!run || (farmId != null && run.farm_id !== farmId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (run.status === "processing") return NextResponse.json({ error: "Already processing" }, { status: 409 });
  await startYieldRun(run.id);
  const after = await prisma.yieldRun.findUnique({ where: { id: run.id }, select: { status: true, error_message: true } });
  if (after?.status === "failed") return NextResponse.json({ error: after.error_message }, { status: 502 });
  return NextResponse.json({ ok: true, status: after?.status });
}
