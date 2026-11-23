import fs from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline as streamPipeline } from "stream/promises";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchPipelineCatalog, triggerCatalogRun, type CatalogPipeline } from "@/lib/processing";
import { basemapSourceDownloadUrl } from "@/lib/basemap-source";
import { keepAsFarmDocument } from "@/lib/farm-document-copy";
import { fetchFromProcessor, ingestTiledRaster, selectContextRasters } from "@/lib/yield-runs";

// Declarative pipelines (docs/pipeline-requests-plan.md, phase 2). The
// definitions live on PipelineProcessor (pipelines/<key>/pipeline.yaml, served
// by GET /v2/catalog); the Dashboard only chooses inputs and settings, starts
// runs (Pipeline_Runs_V2, migration 106) and keeps what comes back:
//
//   vector_layer → Farm_Layers         raster_tiles → a ready Basemap (tiles)
//   document / table / raster_file → a farm Document
//
// Inputs are resolved here, never taken from the browser as URLs:
//   yield_card / document / upload → a Document on the run's farm
//   basemap                        → a ready Basemap on the run's farm
//   farm_fields                    → the farm's Fields (auto)
//   context_rasters                → the farm's context rasters for this season (auto)

export class CatalogRunError extends Error {}

export type InputChoice = {
  document_id?: number; upload_table?: string; upload_id?: number; basemap_id?: number; auto?: boolean;
} | null;

/** Upload tables a file input can come from, per input kind. */
export const UPLOAD_SOURCES: Record<string, readonly string[]> = {
  yield_card: ["documents"],
  document: ["documents"],
  upload: ["documents", "photos", "lab-member-uploads"],
};

/** The farm and file name of one upload, or null if it doesn't exist (or isn't visible). */
export async function uploadRef(table: string, id: number): Promise<{ farm_id: number | null; name: string } | null> {
  if (table === "documents") {
    const d = await prisma.document.findUnique({ where: { id }, select: { farm_id: true, original_name: true, filename: true } });
    return d && { farm_id: d.farm_id, name: path.basename(d.original_name || d.filename) };
  }
  if (table === "photos") {
    const p = await prisma.photo.findUnique({ where: { id }, select: { farm_id: true, filename: true } });
    return p && { farm_id: p.farm_id, name: path.basename(p.filename ?? `photo-${id}`) };
  }
  if (table === "lab-member-uploads") {
    const u = await prisma.labMemberUpload.findUnique({ where: { id }, select: { farm_id: true, filename: true } });
    return u && { farm_id: u.farm_id, name: path.basename(u.filename ?? `upload-${id}`) };
  }
  return null;
}

// The catalogue is cached briefly: an upload burst would otherwise ask the
// processor once per upload just to find out which triggers are live.
let cached: { at: number; value: Awaited<ReturnType<typeof fetchPipelineCatalog>> } | null = null;
export async function cachedCatalog(maxAgeMs = 60_000) {
  if (cached && Date.now() - cached.at < maxAgeMs && cached.value) return cached.value;
  const value = await fetchPipelineCatalog();
  cached = { at: Date.now(), value };
  return value;
}

const DOCUMENT_KINDS = new Set(["yield_card", "document", "upload"]);
const AUTO_KINDS = new Set(["farm_fields", "context_rasters"]);
const LAYER_MAX_FEATURES = 50_000;

export function inputMode(kind: string): "document" | "basemap" | "auto" | "unsupported" {
  if (DOCUMENT_KINDS.has(kind)) return "document";
  if (kind === "basemap") return "basemap";
  if (AUTO_KINDS.has(kind)) return "auto";
  return "unsupported";
}

function baseUrl() {
  return (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
}

async function resolveInputs(def: CatalogPipeline, farmId: number, choices: Record<string, InputChoice>) {
  const sent: Record<string, Record<string, unknown> | null> = {};
  const recorded: Record<string, unknown> = {};
  for (const input of def.inputs) {
    const choice = choices[input.name] ?? null;
    const mode = inputMode(input.kind);
    if (mode === "unsupported") {
      if (input.required) throw new CatalogRunError(`Input "${input.name}" (${input.kind}) can't be chosen from the Dashboard yet`);
      continue;
    }
    if (mode === "auto") {
      if (!input.required && choice?.auto === false) continue;
      if (input.kind === "farm_fields") {
        const fields = await prisma.field.findMany({
          where: { Farms_id: farmId, geometry: { not: null } },
          select: { id: true, Name: true, geometry: true },
        });
        sent[input.name] = { features: fields.map((f) => ({ id: f.id, Name: f.Name ?? `Field ${f.id}`, geometry: f.geometry })) };
        recorded[input.name] = { kind: input.kind, auto: true, count: fields.length };
      } else {
        const { rasters } = await selectContextRasters(farmId, new Date(), baseUrl());
        sent[input.name] = { rasters };
        recorded[input.name] = { kind: input.kind, auto: true, count: rasters.length };
      }
      continue;
    }
    if (mode === "document") {
      const table = choice?.upload_table ?? "documents";
      const id = Number(choice?.upload_id ?? choice?.document_id);
      if (!Number.isInteger(id) || id <= 0) {
        if (input.required) throw new CatalogRunError(`Pick a document for "${input.name}"`);
        continue;
      }
      if (!(UPLOAD_SOURCES[input.kind] ?? []).includes(table)) {
        throw new CatalogRunError(`"${input.name}" can't take a file from ${table}`);
      }
      const ref = await uploadRef(table, id);
      if (!ref || ref.farm_id !== farmId) throw new CatalogRunError(`${table === "documents" ? "Document" : "Upload"} ${id} isn't on this farm`);
      sent[input.name] = {
        download_url: `${baseUrl()}/api/data/files/${table}/${id}`,
        filename: input.kind === "yield_card" ? "card.zip" : ref.name,
        source: { table, id },
      };
      recorded[input.name] = { kind: input.kind, upload_table: table, upload_id: id, label: ref.name, ...(table === "documents" ? { document_id: id } : {}) };
      continue;
    }
    const id = Number(choice?.basemap_id);
    if (!Number.isInteger(id) || id <= 0) {
      if (input.required) throw new CatalogRunError(`Pick a basemap for "${input.name}"`);
      continue;
    }
    const b = await prisma.basemap.findUnique({ where: { id } });
    if (!b || b.farm_id !== farmId || b.tiling_status !== "ready") throw new CatalogRunError(`Basemap ${id} isn't a finished basemap on this farm`);
    sent[input.name] = {
      download_url: await basemapSourceDownloadUrl(b),
      filename: path.basename(b.source_filename),
      source: { table: "basemaps", id: b.id },
    };
    recorded[input.name] = { kind: input.kind, basemap_id: b.id, label: b.display_name || b.original_filename };
  }
  return { sent, recorded };
}

/** Starts one run of a catalogue pipeline on a farm. Throws CatalogRunError for bad choices. */
export async function startCatalogRun(opts: {
  labId: number; farmId: number; key: string; inputs: Record<string, InputChoice>;
  params: Record<string, unknown>; userId: string | null;
  trigger?: { table: string; id: number; ruleId: number };
  catalog?: Awaited<ReturnType<typeof fetchPipelineCatalog>>;
}) {
  const catalog = opts.catalog ?? (await fetchPipelineCatalog());
  if (!catalog) throw new CatalogRunError("The processing machine isn't reachable");
  const def = catalog.pipelines.find((p) => p.key === opts.key);
  if (!def) throw new CatalogRunError(`No pipeline "${opts.key}" on the processing machine`);
  const farm = await prisma.farm.findUnique({ where: { id: opts.farmId }, select: { id: true } });
  if (!farm) throw new CatalogRunError("Farm not found");

  const { sent, recorded } = await resolveInputs(def, opts.farmId, opts.inputs);
  const params: Record<string, unknown> = {};
  for (const p of def.params) if (opts.params[p.name] !== undefined && opts.params[p.name] !== "") params[p.name] = opts.params[p.name];
  const request = await prisma.pipelineRequest.findFirst({ where: { lab_id: opts.labId, pipeline_key: def.key }, select: { id: true } });

  const run = await prisma.pipelineRunV2.create({
    data: {
      lab_id: opts.labId, pipeline_key: def.key, pipeline_version: def.version, pipeline_name: def.name,
      farm_id: opts.farmId, request_id: request?.id ?? null,
      inputs: recorded as Prisma.InputJsonValue, params: params as Prisma.InputJsonValue, created_by_id: opts.userId,
      ...(opts.trigger ? { trigger_table: opts.trigger.table, trigger_id: opts.trigger.id, trigger_rule_id: opts.trigger.ruleId } : {}),
    },
  });
  try {
    await triggerCatalogRun(run.id, {
      key: def.key, version: def.version, callback_url: `${baseUrl()}/api/pipeline-runs-v2/webhook`,
      farm_id: opts.farmId, inputs: sent, params,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const detail = msg.match(/→ \d+: ([\s\S]*)$/)?.[1];
    let text = "Failed to reach the processing machine";
    try { text = JSON.parse(detail ?? "")?.detail ?? text; } catch {}
    await prisma.pipelineRunV2.update({ where: { id: run.id }, data: { status: "failed", error_message: text, finished_at: new Date() } });
    return prisma.pipelineRunV2.findUniqueOrThrow({ where: { id: run.id } });
  }
  await prisma.pipelineRunV2.updateMany({ where: { id: run.id, status: "pending" }, data: { status: "running", started_at: new Date() } });
  return prisma.pipelineRunV2.findUniqueOrThrow({ where: { id: run.id } });
}

// ── Webhook ingest ────────────────────────────────────────────────────────────

type OutputPayload = {
  name: string; kind: string; meta?: Record<string, unknown>;
  url?: string; filename?: string; source_url?: string; tile_archive_url?: string;
};
export interface CatalogWebhookPayload {
  event: "pipeline_run_completed" | "pipeline_run_failed";
  run_id: number;
  key?: string;
  version?: number;
  status?: "ready" | "partial";
  error_message?: string;
  steps?: unknown[];
  outputs?: OutputPayload[];
}

async function downloadToTmp(url: string, name: string): Promise<string> {
  const p = path.join(os.tmpdir(), `pipeline-run-${Date.now()}-${name.replace(/[^\w.-]/g, "_")}`);
  const res = await fetchFromProcessor(url);
  await streamPipeline(Readable.fromWeb(res.body as import("stream/web").ReadableStream), fs.createWriteStream(p));
  return p;
}

function geometryKind(fc: GeoJSON.FeatureCollection): string {
  const kinds = new Set(fc.features.map((f) => {
    const t = f.geometry?.type ?? "";
    return t.includes("Point") ? "point" : t.includes("Line") ? "line" : t.includes("Polygon") ? "polygon" : "mixed";
  }));
  return kinds.size === 1 ? [...kinds][0] : "mixed";
}

async function ingestOutput(
  run: { id: number; farm_id: number; pipeline_name: string; created_by_id: string | null },
  o: OutputPayload,
): Promise<Record<string, unknown>> {
  const label = `${run.pipeline_name} — ${o.name.replace(/_/g, " ")}`;
  if (o.kind === "vector_layer") {
    const fc = (await (await fetchFromProcessor(o.url!)).json()) as GeoJSON.FeatureCollection;
    if (fc?.type !== "FeatureCollection" || !Array.isArray(fc.features)) throw new Error("not a FeatureCollection");
    if (fc.features.length > LAYER_MAX_FEATURES) throw new Error(`${fc.features.length} features (max ${LAYER_MAX_FEATURES})`);
    const layer = await prisma.farmLayer.create({
      data: {
        farm_id: run.farm_id, name: label, geometry_kind: String(o.meta?.geometry_kind ?? geometryKind(fc)),
        feature_count: fc.features.length, geojson: fc as unknown as Prisma.InputJsonValue,
        original_filename: o.filename ?? `${o.name}.geojson`, source_epsg: 4326, uploaded_by_id: run.created_by_id,
      },
    });
    return { name: o.name, kind: o.kind, farm_layer_id: layer.id };
  }
  if (o.kind === "raster_tiles") {
    const m = o.meta ?? {};
    const basemapId = await ingestTiledRaster({
      farmId: run.farm_id, uploadedById: run.created_by_id, filePrefix: `pipeline-run-${run.id}-${o.name}`,
      originalFilename: `${o.name}.tif`, displayName: `${label}${m.unit ? ` (${m.unit})` : ""}`,
      map: {
        source_url: o.source_url, tile_archive_url: o.tile_archive_url,
        footprint: m.footprint as GeoJSON.Polygon | undefined, crs_status: (m.crs_status as string | undefined) ?? "ok",
        crs_epsg: (m.crs_epsg as number | null | undefined) ?? null,
        min_zoom: m.min_zoom as number | undefined, max_zoom: m.max_zoom as number | undefined,
      },
    });
    return { name: o.name, kind: o.kind, basemap_id: basemapId };
  }
  if (o.kind === "document" || o.kind === "table" || o.kind === "raster_file") {
    const filename = path.basename(o.filename || `${o.name}`);
    const tmp = await downloadToTmp(o.url!, filename);
    try {
      const documentId = await keepAsFarmDocument({
        farmId: run.farm_id, originalName: filename,
        description: String(o.meta?.description ?? `${label} (pipeline run #${run.id})`),
        sourcePath: tmp,
      });
      return { name: o.name, kind: o.kind, document_id: documentId };
    } finally {
      fs.unlink(tmp, () => {});
    }
  }
  throw new Error(`unknown output kind ${o.kind}`);
}

/** Applies the processor's callback. Idempotent: a finished run isn't ingested twice. */
export async function ingestCatalogRun(payload: CatalogWebhookPayload): Promise<string> {
  const run = await prisma.pipelineRunV2.findUnique({ where: { id: Number(payload.run_id) } });
  if (!run) return "run_not_found";
  if (["ready", "partial", "failed"].includes(run.status)) return "already_finished";
  const steps = (payload.steps ?? []) as Prisma.InputJsonValue;

  if (payload.event === "pipeline_run_failed") {
    await prisma.pipelineRunV2.update({
      where: { id: run.id },
      data: { status: "failed", error_message: (payload.error_message ?? "Pipeline failed").slice(0, 2000), steps, finished_at: new Date() },
    });
    return "failed";
  }
  if (run.farm_id == null) {
    await prisma.pipelineRunV2.update({ where: { id: run.id }, data: { status: "failed", error_message: "Run has no farm to keep outputs on", steps, finished_at: new Date() } });
    return "no_farm";
  }
  const kept: Record<string, unknown>[] = [];
  for (const o of payload.outputs ?? []) {
    try {
      kept.push(await ingestOutput({ ...run, farm_id: run.farm_id }, o));
    } catch (err) {
      console.error(`[pipeline run ${run.id}] output ${o.name}`, err);
      kept.push({ name: o.name, kind: o.kind, error: err instanceof Error ? err.message.slice(0, 300) : "ingest failed" });
    }
  }
  const anyError = kept.some((k) => k.error);
  await prisma.pipelineRunV2.update({
    where: { id: run.id },
    data: {
      status: payload.status === "partial" || anyError ? "partial" : "ready",
      steps, outputs: kept as Prisma.InputJsonValue, error_message: null, finished_at: new Date(),
    },
  });
  return "ingested";
}
