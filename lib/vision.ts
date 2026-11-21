import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { processingConfigured, triggerVisionRun, type TriggerVisionRunPayload } from "@/lib/processing";
import { basemapSourceDownloadUrl } from "@/lib/basemap-source";
import { parsePointsCsv } from "@/lib/csv-points";

// Machine vision (GitHub issue #4, migration 103, docs/machine-vision-plan.md).
// A Vision_Jobs row hangs off a workflow Task. Its sources are the Task's
// linked photos (synced from Task_Upload_Links) plus any Basemaps picked for
// it; labels are points/boxes/polygons per source and class. A run sends
// everything to PipelineProcessor (vision.py there): DINOv3 patch embeddings,
// cached per source, plus a kNN / logistic-regression head fitted on the
// labels. POST /api/vision-runs/webhook -> ingestVisionResults() stores the
// predictions and, for ortho sources, a Farm_Layers overlay so the farm map
// shows them with no extra code.
//
// Geometry spaces: photo = pixels of the EXIF-rotated image ([x, y], y down);
// basemap = lon/lat. The pixel<->CRS mapping for orthos is the processor's
// business only.

export const PHOTO_TABLES = ["photos", "lab-member-uploads"] as const;
export const VISION_PALETTE = ["#e11d48", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];
export const BACKGROUND_COLOR = "#78716c";
const LAYER_MAX_FEATURES = 5000;

export type VisionParams = {
  head: "knn" | "logreg";
  k: number;
  threshold: number;
  min_patches: number;
  gsd_m: number | null;
  max_side: number | null;
  model: string | null;
};

export const DEFAULT_PARAMS: VisionParams = {
  head: "knn", k: 10, threshold: 0.5, min_patches: 1, gsd_m: null, max_side: null, model: null,
};

export function parseParams(input: unknown): VisionParams {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number, d: number | null) => {
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
  };
  return {
    head: o.head === "logreg" ? "logreg" : "knn",
    k: Math.round(num(o.k, 1, 100, DEFAULT_PARAMS.k)!),
    threshold: num(o.threshold, 0.05, 0.99, DEFAULT_PARAMS.threshold)!,
    min_patches: Math.round(num(o.min_patches, 1, 10_000, 1)!),
    gsd_m: num(o.gsd_m, 0.001, 10, null),
    max_side: (() => { const n = num(o.max_side, 224, 4096, null); return n == null ? null : Math.round(n); })(),
    model: typeof o.model === "string" && /^[\w.-]{1,100}$/.test(o.model) ? o.model : null,
  };
}

/** The processor's cache key for a source: what the bytes are, not which job uses them. */
export function sourceKey(s: { kind: string; upload_table: string | null; upload_id: number | null; basemap_id: number | null }): string {
  return s.kind === "basemap" ? `basemap-${s.basemap_id}` : `${s.upload_table}-${s.upload_id}`;
}

export async function createVisionJob(taskId: number, opts: { mode?: string; classes: string[]; userId: string | null }) {
  const names = Array.from(new Set(opts.classes.map((c) => c.trim()).filter(Boolean))).slice(0, 20);
  if (names.length === 0) throw new VisionInputError("Add at least one class to look for");
  const job = await prisma.visionJob.create({
    data: {
      task_id: taskId,
      mode: opts.mode === "segmentation" ? "segmentation" : "detection",
      settings: DEFAULT_PARAMS as unknown as Prisma.InputJsonValue,
      created_by_id: opts.userId,
      Classes: {
        create: [
          { name: "background", color: BACKGROUND_COLOR, is_background: true, sort_order: 0 },
          ...names.filter((n) => n.toLowerCase() !== "background")
            .map((name, i) => ({ name, color: VISION_PALETTE[i % VISION_PALETTE.length], sort_order: i + 1 })),
        ],
      },
    },
  });
  await syncPhotoSources(job.id);
  return job;
}

export class VisionInputError extends Error {}

/**
 * Makes the job's photo sources match the Task's linked photo uploads. A
 * photo that was unlinked is dropped only if it has no labels, so unlinking
 * never silently throws labeling work away.
 */
export async function syncPhotoSources(jobId: number): Promise<void> {
  const job = await prisma.visionJob.findUnique({
    where: { id: jobId },
    select: { id: true, Task: { select: { UploadLinks: true } }, Sources: { where: { kind: "photo" }, include: { _count: { select: { Labels: true } } } } },
  });
  if (!job) return;
  const links = job.Task.UploadLinks.filter((l) => (PHOTO_TABLES as readonly string[]).includes(l.upload_table));
  // lab-member uploads are mixed media; only photos can be embedded.
  const lmIds = links.filter((l) => l.upload_table === "lab-member-uploads").map((l) => l.upload_id);
  const lmPhotos = new Set(
    lmIds.length
      ? (await prisma.labMemberUpload.findMany({ where: { id: { in: lmIds }, media_type: "photo" }, select: { id: true } })).map((u) => u.id)
      : [],
  );
  const wanted = links.filter((l) => l.upload_table === "photos" || lmPhotos.has(l.upload_id));
  const have = new Set(job.Sources.map((s) => `${s.upload_table}-${s.upload_id}`));
  const want = new Set(wanted.map((l) => `${l.upload_table}-${l.upload_id}`));

  const add = wanted.filter((l) => !have.has(`${l.upload_table}-${l.upload_id}`));
  if (add.length) {
    await prisma.visionSource.createMany({
      data: add.map((l) => ({ job_id: jobId, kind: "photo", upload_table: l.upload_table, upload_id: l.upload_id })),
      skipDuplicates: true,
    });
  }
  const drop = job.Sources.filter((s) => !want.has(`${s.upload_table}-${s.upload_id}`) && s._count.Labels === 0).map((s) => s.id);
  if (drop.length) await prisma.visionSource.deleteMany({ where: { id: { in: drop } } });
}

/** Sets the job's basemap sources; one with labels is kept even if deselected. */
export async function setBasemapSources(jobId: number, basemapIds: number[]): Promise<void> {
  const ids = Array.from(new Set(basemapIds.filter((n) => Number.isInteger(n))));
  const ready = ids.length
    ? (await prisma.basemap.findMany({ where: { id: { in: ids }, tiling_status: "ready" }, select: { id: true } })).map((b) => b.id)
    : [];
  if (ready.length !== ids.length) throw new VisionInputError("Only finished (tiled) basemaps can be used");
  const current = await prisma.visionSource.findMany({
    where: { job_id: jobId, kind: "basemap" },
    include: { _count: { select: { Labels: true } } },
  });
  const have = new Set(current.map((s) => s.basemap_id));
  const add = ready.filter((id) => !have.has(id));
  if (add.length) {
    await prisma.visionSource.createMany({ data: add.map((basemap_id) => ({ job_id: jobId, kind: "basemap", basemap_id })), skipDuplicates: true });
  }
  const drop = current.filter((s) => !ready.includes(s.basemap_id!) && s._count.Labels === 0).map((s) => s.id);
  if (drop.length) await prisma.visionSource.deleteMany({ where: { id: { in: drop } } });
}

type LabelInput = { source_id: number; class_id: number; geom: unknown; origin?: string };

function validGeom(g: unknown, kind: string): { geom_kind: "point" | "box" | "polygon"; geom: Prisma.InputJsonValue } {
  const o = g as { type?: string; coordinates?: unknown };
  const finite = (p: unknown): p is [number, number] =>
    Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
  const inRange = (p: [number, number]) => kind !== "basemap" || (Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90);
  if (o?.type === "Point" && finite(o.coordinates) && inRange(o.coordinates)) {
    return { geom_kind: "point", geom: { type: "Point", coordinates: [o.coordinates[0], o.coordinates[1]] } };
  }
  if (o?.type === "Polygon" && Array.isArray(o.coordinates) && Array.isArray(o.coordinates[0])) {
    const ring = (o.coordinates[0] as unknown[]);
    if (ring.length >= 4 && ring.length <= 2000 && ring.every((p) => finite(p) && inRange(p as [number, number]))) {
      const r = ring as [number, number][];
      const isBox = r.length === 5 && new Set(r.slice(0, 4).map((p) => p[0])).size === 2 && new Set(r.slice(0, 4).map((p) => p[1])).size === 2;
      return { geom_kind: isBox ? "box" : "polygon", geom: { type: "Polygon", coordinates: [r.map((p) => [p[0], p[1]])] } };
    }
  }
  throw new VisionInputError("Each label needs a GeoJSON Point or Polygon geometry");
}

export async function addLabels(jobId: number, labels: LabelInput[], userId: string | null): Promise<number> {
  if (labels.length === 0) return 0;
  if (labels.length > 20_000) throw new VisionInputError("At most 20,000 labels per request");
  const [sources, classes] = await Promise.all([
    prisma.visionSource.findMany({ where: { job_id: jobId }, select: { id: true, kind: true } }),
    prisma.visionClass.findMany({ where: { job_id: jobId }, select: { id: true } }),
  ]);
  const kindOf = new Map(sources.map((s) => [s.id, s.kind]));
  const classIds = new Set(classes.map((c) => c.id));
  const origins = new Set(["manual", "gps_import", "cvat"]);
  const rows = labels.map((l) => {
    const kind = kindOf.get(Number(l.source_id));
    if (!kind) throw new VisionInputError(`Source ${l.source_id} isn't part of this job`);
    if (!classIds.has(Number(l.class_id))) throw new VisionInputError(`Class ${l.class_id} isn't part of this job`);
    return {
      job_id: jobId, source_id: Number(l.source_id), class_id: Number(l.class_id),
      ...validGeom(l.geom, kind),
      origin: l.origin && origins.has(l.origin) ? l.origin : "manual",
      created_by_id: userId,
    };
  });
  const res = await prisma.visionLabel.createMany({ data: rows });
  return res.count;
}

/**
 * Field GPS points (GeoJSON or CSV with lat/lon columns, EPSG:4326) as point
 * labels on one basemap source. The class comes from `classColumn` (matched
 * to class names, case-insensitive) or `defaultClassId`.
 */
export async function importPointLabels(
  jobId: number,
  opts: { sourceId: number; text: string; filename: string; classColumn: string | null; defaultClassId: number | null; userId: string | null },
): Promise<{ imported: number; skipped: number; unknownClasses: string[] }> {
  const src = await prisma.visionSource.findFirst({ where: { id: opts.sourceId, job_id: jobId } });
  if (!src || src.kind !== "basemap") throw new VisionInputError("Pick a basemap source for GPS points");
  const classes = await prisma.visionClass.findMany({ where: { job_id: jobId } });
  const byName = new Map(classes.map((c) => [c.name.toLowerCase(), c.id]));

  let features: { geometry: { type: string; coordinates: number[] } | null; properties: Record<string, unknown> | null }[];
  if (/\.csv$/i.test(opts.filename)) {
    features = parsePointsCsv(opts.text).features as typeof features;
  } else {
    let parsed: { type?: string; features?: typeof features };
    try {
      parsed = JSON.parse(opts.text);
    } catch {
      throw new VisionInputError("File isn't valid GeoJSON or CSV");
    }
    if (parsed?.type !== "FeatureCollection" || !Array.isArray(parsed.features)) throw new VisionInputError("GeoJSON must be a FeatureCollection");
    features = parsed.features;
  }

  const unknown = new Set<string>();
  const labels: LabelInput[] = [];
  let skipped = 0;
  for (const f of features) {
    const c = f.geometry?.type === "Point" ? f.geometry.coordinates : null;
    if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1]) || Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90) {
      skipped++;
      continue;
    }
    let classId = opts.defaultClassId;
    if (opts.classColumn) {
      const v = String(f.properties?.[opts.classColumn] ?? "").trim();
      const hit = byName.get(v.toLowerCase());
      if (hit) classId = hit;
      else if (v) unknown.add(v);
    }
    if (classId == null || !classes.some((k) => k.id === classId)) {
      skipped++;
      continue;
    }
    labels.push({ source_id: src.id, class_id: classId, geom: { type: "Point", coordinates: [c[0], c[1]] }, origin: "gps_import" });
  }
  const imported = await addLabels(jobId, labels, opts.userId);
  return { imported, skipped, unknownClasses: Array.from(unknown).slice(0, 20) };
}

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

/** Creates a run and sends it to the processor. */
export async function startVisionRun(jobId: number, rawParams: unknown, userId: string | null) {
  if (!processingConfigured) throw new VisionInputError("No processing machine is configured (PROCESSING_URL)");
  await syncPhotoSources(jobId);
  const job = await prisma.visionJob.findUnique({
    where: { id: jobId },
    include: { Classes: true, Sources: { include: { Basemap: true } }, Labels: true, Runs: { where: { status: { in: ["pending", "running"] } }, select: { id: true } } },
  });
  if (!job) throw new VisionInputError("Job not found");
  if (job.Runs.length) throw new VisionInputError("A run is already in progress");
  if (job.Sources.length === 0) throw new VisionInputError("Link photos to the task or pick a basemap first");
  const counts = new Map<number, number>();
  for (const l of job.Labels) counts.set(l.class_id, (counts.get(l.class_id) ?? 0) + 1);
  const bg = job.Classes.find((c) => c.is_background);
  if (!bg || !counts.get(bg.id)) throw new VisionInputError("Label some background first, so the model knows what to ignore");
  if (!job.Classes.some((c) => !c.is_background && counts.get(c.id))) throw new VisionInputError("Label at least one object of a class you're looking for");

  const params = parseParams(rawParams);
  const run = await prisma.visionRun.create({
    data: { job_id: jobId, params: params as unknown as Prisma.InputJsonValue, label_count: job.Labels.length, created_by_id: userId },
  });
  await prisma.visionJob.update({ where: { id: jobId }, data: { settings: params as unknown as Prisma.InputJsonValue, status: "running" } });

  const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
  const keyOf = new Map(job.Sources.map((s) => [s.id, sourceKey(s)]));
  try {
    const sources: TriggerVisionRunPayload["sources"] = [];
    for (const s of job.Sources) {
      if (s.kind === "basemap") {
        if (!s.Basemap) continue;
        sources.push({
          key: keyOf.get(s.id)!, kind: "ortho",
          download_url: await basemapSourceDownloadUrl(s.Basemap),
          sha256: s.Basemap.sha256, crs_epsg: s.Basemap.crs_override_epsg,
        });
      } else {
        sources.push({
          key: keyOf.get(s.id)!, kind: "photo",
          download_url: `${baseUrl}/api/data/files/${s.upload_table}/${s.upload_id}`,
          sha256: null, crs_epsg: null,
        });
      }
    }
    await triggerVisionRun({
      vision_run_id: run.id,
      callback_url: `${baseUrl}/api/vision-runs/webhook`,
      ...params,
      classes: job.Classes.map((c) => ({ id: c.id, name: c.name, background: c.is_background })),
      sources,
      labels: job.Labels.map((l) => ({ source_key: keyOf.get(l.source_id)!, class_id: l.class_id, geom: l.geom })),
    });
  } catch (err) {
    console.error("[vision run] trigger failed", err);
    await prisma.visionRun.update({ where: { id: run.id }, data: { status: "failed", error_message: processorError(err), finished_at: new Date() } });
    await prisma.visionJob.update({ where: { id: jobId }, data: { status: "labeling" } });
    return prisma.visionRun.findUniqueOrThrow({ where: { id: run.id } });
  }
  // Guarded: a fast job's webhook may already have finished it.
  await prisma.visionRun.updateMany({ where: { id: run.id, status: "pending" }, data: { status: "running", started_at: new Date() } });
  return prisma.visionRun.findUniqueOrThrow({ where: { id: run.id } });
}

export interface VisionWebhookPayload {
  event: "vision_completed" | "vision_failed";
  vision_run_id: number;
  error_message?: string;
  model?: string;
  metrics?: Record<string, unknown>;
  sources?: Record<string, Record<string, unknown>>;
  predictions_url?: string;
}

type ProcessorPrediction = {
  source_key: string; class_id: number; score: number; patches?: number;
  centroid: [number, number]; bbox: [number, number, number, number]; polygon?: unknown;
};

async function fetchFromProcessor(url: string): Promise<Response> {
  const apiKey = process.env.PROCESSING_API_KEY;
  const res = await fetch(url, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} });
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
  return res;
}

export async function ingestVisionResults(payload: VisionWebhookPayload): Promise<string> {
  const run = await prisma.visionRun.findUnique({
    where: { id: payload.vision_run_id },
    include: { Job: { include: { Classes: true, Sources: { include: { Basemap: { select: { farm_id: true, display_name: true, original_filename: true } } } }, Task: { select: { description: true } } } } },
  });
  if (!run) return "run_not_found";
  if (run.status === "ready") return "already_ingested";

  if (payload.event === "vision_failed") {
    await prisma.visionRun.update({
      where: { id: run.id },
      data: { status: "failed", error_message: payload.error_message ?? "Vision run failed", finished_at: new Date() },
    });
    await prisma.visionJob.update({ where: { id: run.job_id }, data: { status: "labeling" } });
    return "failed";
  }
  if (!payload.predictions_url) return "ignored";

  const preds = (await (await fetchFromProcessor(payload.predictions_url)).json()) as ProcessorPrediction[];
  const sourceByKey = new Map(run.Job.Sources.map((s) => [sourceKey(s), s]));
  const classById = new Map(run.Job.Classes.map((c) => [c.id, c]));
  const rows = preds
    .filter((p) => sourceByKey.has(p.source_key) && classById.has(p.class_id))
    .map((p) => ({
      run_id: run.id,
      source_id: sourceByKey.get(p.source_key)!.id,
      class_id: p.class_id,
      score: p.score,
      patches: p.patches ?? null,
      centroid: p.centroid as unknown as Prisma.InputJsonValue,
      bbox: p.bbox as unknown as Prisma.InputJsonValue,
      polygon: (p.polygon ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    }));
  await prisma.visionPrediction.deleteMany({ where: { run_id: run.id } });
  for (let i = 0; i < rows.length; i += 1000) {
    await prisma.visionPrediction.createMany({ data: rows.slice(i, i + 1000) });
  }

  // Processor-side source info (size, grid, working resolution) for the UI.
  for (const [key, meta] of Object.entries(payload.sources ?? {})) {
    const s = sourceByKey.get(key);
    if (s) await prisma.visionSource.update({ where: { id: s.id }, data: { meta: meta as Prisma.InputJsonValue } });
  }

  // Ortho predictions -> one Farm_Layers overlay (the first basemap's farm),
  // replacing the layer an earlier run of this job made.
  const layerId = await writePredictionLayer(run.id, run.job_id, run.Job.Task.description, preds, sourceByKey, classById);

  await prisma.visionRun.update({
    where: { id: run.id },
    data: {
      status: "ready",
      metrics: { ...(payload.metrics ?? {}), model: payload.model ?? null } as Prisma.InputJsonValue,
      prediction_count: rows.length,
      layer_id: layerId,
      finished_at: new Date(),
      error_message: null,
    },
  });
  await prisma.visionJob.update({ where: { id: run.job_id }, data: { status: "review" } });
  return "ingested";
}

async function writePredictionLayer(
  runId: number,
  jobId: number,
  taskDescription: string,
  preds: ProcessorPrediction[],
  sourceByKey: Map<string, { kind: string; Basemap: { farm_id: number; display_name: string | null; original_filename: string } | null }>,
  classById: Map<number, { name: string; color: string }>,
): Promise<number | null> {
  const ortho = preds.filter((p) => sourceByKey.get(p.source_key)?.kind === "basemap" && classById.has(p.class_id));
  const earlier = await prisma.visionRun.findMany({ where: { job_id: jobId, id: { not: runId }, layer_id: { not: null } }, select: { layer_id: true } });
  if (earlier.length) await prisma.farmLayer.deleteMany({ where: { id: { in: earlier.map((r) => r.layer_id!) } } });
  if (ortho.length === 0) return null;

  const farmId = sourceByKey.get(ortho[0].source_key)!.Basemap!.farm_id;
  const shown = ortho
    .filter((p) => sourceByKey.get(p.source_key)!.Basemap!.farm_id === farmId)
    .sort((a, b) => b.score - a.score)
    .slice(0, LAYER_MAX_FEATURES);
  const features = shown.map((p) => {
    const cls = classById.get(p.class_id)!;
    return {
      type: "Feature" as const,
      geometry: (p.polygon as GeoJSON.Geometry | undefined) ?? { type: "Point" as const, coordinates: p.centroid },
      properties: { class: cls.name, score: Math.round(p.score * 1000) / 1000, _color: cls.color },
    };
  });
  const kinds = new Set(features.map((f) => f.geometry.type.replace("Multi", "").toLowerCase()));
  const name = `Vision — ${taskDescription.slice(0, 60)} (run ${runId})${shown.length < ortho.length ? " (top " + shown.length + ")" : ""}`;
  const layer = await prisma.farmLayer.create({
    data: {
      farm_id: farmId,
      name,
      geometry_kind: kinds.size === 1 ? Array.from(kinds)[0] : "mixed",
      feature_count: features.length,
      geojson: { type: "FeatureCollection", features } as unknown as Prisma.InputJsonValue,
      original_filename: `vision-run-${runId}.geojson`,
      source_epsg: 4326,
    },
  });
  return layer.id;
}

/** Predictions of one run as GeoJSON (orthos: lon/lat; photos: pixel space). */
export async function predictionsGeojson(runId: number, sourceId?: number) {
  const preds = await prisma.visionPrediction.findMany({
    where: { run_id: runId, ...(sourceId ? { source_id: sourceId } : {}) },
    include: { Class: { select: { name: true } }, Source: true },
    orderBy: { score: "desc" },
  });
  return {
    type: "FeatureCollection",
    features: preds.map((p) => ({
      type: "Feature",
      geometry: p.polygon ?? { type: "Point", coordinates: p.centroid },
      properties: {
        id: p.id, class: p.Class.name, score: p.score, review: p.review,
        source: sourceKey(p.Source), space: p.Source.kind === "basemap" ? "lonlat" : "pixel",
        bbox: p.bbox, centroid: p.centroid,
      },
    })),
  };
}
