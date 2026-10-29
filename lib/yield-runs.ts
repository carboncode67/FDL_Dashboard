import { NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline as streamPipeline } from "stream/promises";
import yauzl from "yauzl";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { processingConfigured, triggerYieldClean } from "@/lib/processing";
import { keepAsFarmDocument } from "@/lib/farm-document-copy";

// Yield-card cleaning (migration 090). The unified farm upload box (and OFE's
// port of it) sends a zipped CNH CN1 card to receiveYieldCardUpload()
// (lib/farm-uploads.ts), which stores it and calls startYieldRun() here.
// PipelineProcessor runs the lab's yieldclean image on it (its
// yield_clean.py) and calls back POST /api/yield-runs/webhook →
// ingestYieldResults(): the kept points become a Farm_Layers overlay
// (coloured by yield quintile) and the full results archive (cleaned
// gpkg/csv, QA report, field summary) a farm Document.
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
  try {
    await triggerYieldClean({
      yield_run_id: run.id,
      download_url: `${baseUrl}/api/files/${YIELD_SOURCES_DIRNAME}/${run.source_filename}`,
      callback_url: `${baseUrl}/api/yield-runs/webhook`,
      farm_id: run.farm_id,
      boundaries: fields.map((f) => ({ id: f.id, Name: f.Name ?? `Field ${f.id}`, geometry: f.geometry })),
    });
  } catch (err) {
    console.error("[yield run] trigger failed", err);
    await prisma.yieldRun.update({ where: { id: run.id }, data: { status: "failed", error_message: processorError(err) } });
    return;
  }
  // Guarded: a fast job's webhook may already have set ready/failed.
  await prisma.yieldRun.updateMany({ where: { id: run.id, status: "pending" }, data: { status: "processing" } });
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
}

// Bearer PROCESSING_API_KEY, the secret PipelineProcessor's _check_auth expects —
// same as the basemap webhook's tile-archive download.
async function fetchFromProcessor(url: string): Promise<Response> {
  const apiKey = process.env.PROCESSING_API_KEY;
  const res = await fetch(url, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} });
  if (!res.ok || !res.body) throw new Error(`download failed: ${res.status} ${url}`);
  return res;
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

    await prisma.yieldRun.update({
      where: { id: run.id },
      data: {
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
