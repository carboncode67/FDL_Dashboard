import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { prepareVisionSource, processingConfigured, triggerVisionRun, type TriggerVisionRunPayload, type VisionSourceRef } from "@/lib/processing";
import { basemapSourceDownloadUrl } from "@/lib/basemap-source";
import { parsePointsCsv } from "@/lib/csv-points";
import { applyEpsgTransform, geopackageEpsg, parseVectorUpload } from "@/lib/parse-boundaries";
import { pointInGeometry } from "@/lib/geo";
import { scaleParams } from "@/lib/vision-scale";
import type { FeatureCollection, Geometry } from "geojson";

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
  /** Rough size of the objects on orthos, metres; sets the working GSD and how far a point label reaches. */
  object_size_m: number | null;
};

export const DEFAULT_PARAMS: VisionParams = {
  head: "knn", k: 10, threshold: 0.5, min_patches: 1, gsd_m: null, max_side: null, model: null, object_size_m: null,
};

export { scaleParams } from "@/lib/vision-scale";

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
    object_size_m: num(o.object_size_m, 0.02, 200, null),
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

type BasemapRow = NonNullable<Awaited<ReturnType<typeof prisma.basemap.findUnique>>>;

/**
 * How the processor knows an ortho: its key + sha256 name the processor's
 * local copy (vision_sources.py), so runs and label-checker chips must agree.
 */
export async function orthoSourceRef(basemapId: number, b: BasemapRow): Promise<VisionSourceRef> {
  return {
    key: `basemap-${basemapId}`, kind: "ortho",
    download_url: await basemapSourceDownloadUrl(b),
    sha256: b.sha256, crs_epsg: b.crs_override_epsg,
  };
}

/** Asks the processor to fetch these orthos now, so the label checker has full-resolution chips before any run. */
export async function prepareOrthos(basemapIds: number[]): Promise<void> {
  if (!processingConfigured) return;
  for (const id of basemapIds) {
    try {
      const b = await prisma.basemap.findUnique({ where: { id } });
      if (b && b.tiling_status === "ready") await prepareVisionSource(await orthoSourceRef(id, b));
    } catch (err) {
      console.error(`[vision] prepare basemap ${id}`, err);
    }
  }
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
    void prepareOrthos(add); // best-effort, in the background
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

// ── Training-label files (field GPS points / digitised polygons) ─────────────
// CSV (lat/lon or x/y columns), GeoJSON, zipped or loose shapefile (.shp with
// .dbf/.prj/.cpg), GeoPackage, KML/KMZ. Parsed with the farm-upload parser
// (lib/parse-boundaries.ts) and reprojected to lon/lat. Points become point
// labels; polygons (and each part of a multipolygon) become polygon labels.
// The class comes from a label column: one value means background, every
// other value is a class of that name (created if the job lacks it).

export const LABEL_FILE_EXTENSIONS = [".csv", ".geojson", ".json", ".zip", ".shp", ".gpkg", ".kml", ".kmz"];
const SIDECAR_EXTENSIONS = [".dbf", ".prj", ".cpg", ".shx"];
const MAX_POLYGON_VERTICES = 2000;
const MAX_PREVIEW_VALUES = 50;

export type LabelFile = { name: string; buffer: Buffer };
type LabelFeature = { geom: { type: "Point" | "Polygon"; coordinates: unknown }; props: Record<string, unknown>; first: [number, number] };

const ext = (name: string) => (name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "");

/** Normalises an attribute value for matching: trimmed string, "" for null/missing. */
export function labelValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v).trim();
}

async function readLabelFile(files: LabelFile[], epsgIn: number | null): Promise<{ features: LabelFeature[]; skipped: number; epsg: number; epsgDetected: boolean }> {
  const main = files.filter((f) => LABEL_FILE_EXTENSIONS.includes(ext(f.name)));
  if (main.length !== 1) {
    throw new VisionInputError(main.length
      ? "Pick one label file (plus a shapefile's .dbf/.prj/.cpg)"
      : `Unsupported file type. Use ${LABEL_FILE_EXTENSIONS.join(", ")}`);
  }
  const file = main[0];
  const sidecars = files.filter((f) => f !== file && SIDECAR_EXTENSIONS.includes(ext(f.name)));
  const e = ext(file.name);
  if (e === ".shp" && !sidecars.some((s) => ext(s.name) === ".dbf")) {
    throw new VisionInputError("A loose .shp needs its .dbf alongside (select both, plus .prj if there is one), or upload the shapefile as a .zip");
  }

  let epsg = epsgIn ?? 4326;
  let epsgDetected = false;
  if (epsgIn == null && e === ".gpkg") {
    const found = await geopackageEpsg(file.buffer);
    if (found) { epsg = found; epsgDetected = true; }
  }
  let fc: FeatureCollection;
  try {
    fc = e === ".csv"
      ? applyEpsgTransform(parsePointsCsv(file.buffer.toString("utf8")), epsg)
      : await parseVectorUpload(file.name, file.buffer, epsg, sidecars);
  } catch (err) {
    throw new VisionInputError(err instanceof Error ? err.message : "Couldn't read the file");
  }

  const features: LabelFeature[] = [];
  // Empty / NaN geometries dropped during reprojection count as unusable too.
  let skipped = (fc as { droppedInvalid?: number }).droppedInvalid ?? 0;
  const pt = (p: unknown): [number, number] | null =>
    Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90 ? [p[0], p[1]] : null;
  const addPolygon = (rings: unknown, props: Record<string, unknown>) => {
    const outer = Array.isArray(rings) ? (rings[0] as unknown[]) : null;
    const ring = outer?.map(pt);
    if (!ring || ring.length < 4 || ring.length > MAX_POLYGON_VERTICES || ring.some((p) => !p)) return skipped++;
    const r = ring as [number, number][];
    features.push({ geom: { type: "Polygon", coordinates: [r] }, props, first: r[0] });
  };
  const visit = (g: Geometry | null | undefined, props: Record<string, unknown>) => {
    if (!g) return skipped++;
    switch (g.type) {
      case "Point": {
        const p = pt(g.coordinates);
        if (!p) return skipped++;
        features.push({ geom: { type: "Point", coordinates: p }, props, first: p });
        return;
      }
      case "MultiPoint":
        for (const c of g.coordinates) visit({ type: "Point", coordinates: c }, props);
        return;
      case "Polygon":
        return addPolygon(g.coordinates, props);
      case "MultiPolygon":
        for (const c of g.coordinates) addPolygon(c, props);
        return;
      case "GeometryCollection":
        for (const c of g.geometries) visit(c, props);
        return;
      default:
        skipped++; // lines aren't labels
    }
  };
  for (const f of fc.features) visit(f.geometry, (f.properties ?? {}) as Record<string, unknown>);

  // Nothing usable but plenty of features: almost always projected coordinates read as lon/lat.
  if (features.length === 0 && fc.features.length > 0) {
    throw new VisionInputError(
      `None of the ${fc.features.length} features are usable points or polygons in lon/lat. ` +
      (epsg === 4326 ? "If the file is in a projected CRS (e.g. UTM), enter its EPSG code." : `Check that EPSG:${epsg} is the file's CRS.`),
    );
  }
  return { features, skipped, epsg, epsgDetected };
}

async function basemapSourceFor(jobId: number, sourceId: number) {
  const src = await prisma.visionSource.findFirst({ where: { id: sourceId, job_id: jobId }, include: { Basemap: { select: { footprint: true } } } });
  if (!src || src.kind !== "basemap") throw new VisionInputError("Pick an ortho to put the labels on");
  return src;
}

const insideFootprint = (footprint: unknown, f: LabelFeature) =>
  !footprint || pointInGeometry(f.first[1], f.first[0], footprint);

export type LabelFilePreview = {
  features: number; points: number; polygons: number; skipped: number; outside: number;
  epsg: number; epsgDetected: boolean;
  columns: { name: string; distinct: number; values: { value: string; count: number }[] }[];
};

/** Reads a label file without importing it, so the user can pick the label column and background value. */
export async function previewLabelFile(jobId: number, opts: { sourceId: number; files: LabelFile[]; epsg: number | null }): Promise<LabelFilePreview> {
  const src = await basemapSourceFor(jobId, opts.sourceId);
  const { features, skipped, epsg, epsgDetected } = await readLabelFile(opts.files, opts.epsg);
  const counts = new Map<string, Map<string, number>>();
  for (const f of features) {
    for (const [k, v] of Object.entries(f.props)) {
      if (v !== null && typeof v === "object") continue;
      let m = counts.get(k);
      if (!m) counts.set(k, (m = new Map()));
      const s = labelValue(v);
      m.set(s, (m.get(s) ?? 0) + 1);
    }
  }
  const columns = Array.from(counts, ([name, m]) => ({
    name,
    distinct: m.size,
    values: Array.from(m, ([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
      .slice(0, MAX_PREVIEW_VALUES),
  }));
  return {
    features: features.length,
    points: features.filter((f) => f.geom.type === "Point").length,
    polygons: features.filter((f) => f.geom.type === "Polygon").length,
    skipped,
    outside: features.filter((f) => !insideFootprint(src.Basemap?.footprint, f)).length,
    epsg, epsgDetected, columns,
  };
}

/**
 * Imports a label file onto one ortho source. With `classColumn`, a feature
 * whose value equals `backgroundValue` (case-insensitive; "" = empty/missing)
 * is background and any other value is the class of that name, created if
 * the job doesn't have it. Empty values are skipped unless they are the
 * background value. Without a column, every feature gets `defaultClassId`.
 * Labels outside the ortho's footprint are skipped.
 */
export async function importLabelFile(
  jobId: number,
  opts: {
    sourceId: number; files: LabelFile[]; epsg: number | null;
    classColumn: string | null; backgroundValue: string | null; defaultClassId: number | null; userId: string | null;
  },
): Promise<{ imported: number; skipped: number; outside: number; emptyValues: number; createdClasses: string[] }> {
  const src = await basemapSourceFor(jobId, opts.sourceId);
  const { features, skipped } = await readLabelFile(opts.files, opts.epsg);
  const classes = await prisma.visionClass.findMany({ where: { job_id: jobId } });
  const bg = classes.find((c) => c.is_background)!;
  if (!opts.classColumn && (opts.defaultClassId == null || !classes.some((c) => c.id === opts.defaultClassId))) {
    throw new VisionInputError("Pick the label column, or one class for the whole file");
  }

  const inside = features.filter((f) => insideFootprint(src.Basemap?.footprint, f));
  const outside = features.length - inside.length;
  const bgValue = opts.backgroundValue == null ? null : opts.backgroundValue.trim().toLowerCase();
  let emptyValues = 0;
  const wanted: { f: LabelFeature; name: string | null }[] = []; // name null = background / default class
  for (const f of inside) {
    if (!opts.classColumn) { wanted.push({ f, name: null }); continue; }
    const v = labelValue(f.props[opts.classColumn]);
    if (bgValue != null && v.toLowerCase() === bgValue) wanted.push({ f, name: null });
    else if (v === "") emptyValues++;
    else wanted.push({ f, name: v });
  }

  // Classes by name, case-insensitive; "background" in the file means background.
  const byName = new Map(classes.map((c) => [c.name.toLowerCase(), c.id]));
  const newNames = Array.from(new Set(wanted.flatMap((w) => (w.name ? [w.name] : []))))
    .filter((n) => !byName.has(n.toLowerCase()))
    .reduce<string[]>((acc, n) => (acc.some((a) => a.toLowerCase() === n.toLowerCase()) ? acc : [...acc, n]), []);
  const fg = classes.filter((c) => !c.is_background).length;
  if (fg + newNames.length > 20) {
    throw new VisionInputError(
      `"${opts.classColumn}" would add ${newNames.length} new classes (at most 20 in all). ` +
      "Pick a column with fewer distinct values, or set which value is background.",
    );
  }
  if (newNames.some((n) => n.length > 100)) throw new VisionInputError("Class names must be 100 characters or fewer");

  if (newNames.length) {
    await prisma.visionClass.createMany({
      data: newNames.map((name, i) => ({
        job_id: jobId, name, color: VISION_PALETTE[(fg + i) % VISION_PALETTE.length], sort_order: classes.length + i,
      })),
    });
    for (const c of await prisma.visionClass.findMany({ where: { job_id: jobId, name: { in: newNames } } })) byName.set(c.name.toLowerCase(), c.id);
  }
  const labels: LabelInput[] = wanted.map((w) => ({
    source_id: src.id,
    class_id: w.name ? byName.get(w.name.toLowerCase())! : opts.classColumn ? bg.id : opts.defaultClassId!,
    geom: w.f.geom, origin: "gps_import",
  }));
  const imported = await addLabels(jobId, labels, opts.userId);
  return { imported, skipped, outside, emptyValues, createdClasses: newNames };
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
    include: { Classes: true, Sources: { include: { Basemap: true } }, Labels: { where: { rejected: false } }, Runs: { where: { status: { in: ["pending", "running"] } }, select: { id: true } } },
  });
  if (!job) throw new VisionInputError("Job not found");
  if (job.Runs.length) throw new VisionInputError("A run is already in progress");
  if (job.Sources.length === 0) throw new VisionInputError("Link photos to the task or pick a basemap first");
  const counts = new Map<number, number>();
  for (const l of job.Labels) counts.set(l.class_id, (counts.get(l.class_id) ?? 0) + 1);
  const bg = job.Classes.find((c) => c.is_background);
  if (!bg || !counts.get(bg.id)) throw new VisionInputError("Label some background first, so the model knows what to ignore");
  if (!job.Classes.some((c) => !c.is_background && counts.get(c.id))) throw new VisionInputError("Label at least one object of a class you're looking for");

  // The object size is set on the job (label checker / run form) and carried into every run.
  const saved = (job.settings ?? {}) as Record<string, unknown>;
  const params = parseParams({ object_size_m: saved.object_size_m, ...(rawParams && typeof rawParams === "object" ? rawParams : {}) });
  const scale = scaleParams(params.object_size_m);
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
        sources.push(await orthoSourceRef(s.basemap_id!, s.Basemap));
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
      head: params.head, k: params.k, threshold: params.threshold, min_patches: params.min_patches,
      max_side: params.max_side, model: params.model,
      gsd_m: params.gsd_m ?? scale.gsd_m,
      point_radius_m: scale.point_radius_m,
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
  const layerId = await writePredictionLayer(run.id, run.job_id, run.Job.Task.description, preds, sourceByKey, classById, run.Job.mode);

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
  mode: string,
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
      geometry: predictionGeometry(p, mode === "segmentation" ? "polygon" : "box"),
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

export type PredictionShape = "box" | "point" | "polygon";

/**
 * How a prediction is drawn: a detection frame (its bounding box), its centre
 * point, or the patch outline the processor traced. Detection jobs default to
 * frames, segmentation jobs to outlines.
 */
export function predictionGeometry(
  p: { centroid: unknown; bbox: unknown; polygon?: unknown },
  shape: PredictionShape,
): GeoJSON.Geometry {
  const c = p.centroid as [number, number];
  if (shape === "point") return { type: "Point", coordinates: c };
  if (shape === "polygon" && p.polygon) return p.polygon as GeoJSON.Geometry;
  const b = p.bbox as [number, number, number, number] | null;
  if (!b || b.length !== 4) return { type: "Point", coordinates: c };
  const [w, s, e, n] = b;
  return { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] };
}

/** Predictions of one run as GeoJSON (orthos: lon/lat; photos: pixel space). */
export async function predictionsGeojson(runId: number, sourceId?: number, shape?: PredictionShape) {
  const run = await prisma.visionRun.findUnique({ where: { id: runId }, select: { Job: { select: { mode: true } } } });
  const use: PredictionShape = shape ?? (run?.Job.mode === "segmentation" ? "polygon" : "box");
  const preds = await prisma.visionPrediction.findMany({
    where: { run_id: runId, ...(sourceId ? { source_id: sourceId } : {}) },
    include: { Class: { select: { name: true } }, Source: true },
    orderBy: { score: "desc" },
  });
  return {
    type: "FeatureCollection",
    features: preds.map((p) => ({
      type: "Feature",
      geometry: predictionGeometry(p, use),
      properties: {
        id: p.id, class: p.Class.name, score: p.score, review: p.review,
        source: sourceKey(p.Source), space: p.Source.kind === "basemap" ? "lonlat" : "pixel",
        bbox: p.bbox, centroid: p.centroid,
      },
    })),
  };
}

// ── Label checker (migration 104) ────────────────────────────────────────────

export type ReviewLabel = {
  id: number; class_id: number; geom_kind: string; geom: unknown; origin: string;
  checked: boolean; rejected: boolean;
};

/** Every label on one source, for the label checker. */
export async function listLabels(jobId: number, sourceId: number): Promise<ReviewLabel[]> {
  const rows = await prisma.visionLabel.findMany({
    where: { job_id: jobId, source_id: sourceId },
    orderBy: { id: "asc" },
    select: { id: true, class_id: true, geom_kind: true, geom: true, origin: true, checked_at: true, rejected: true },
  });
  return rows.map((r) => ({
    id: r.id, class_id: r.class_id, geom_kind: r.geom_kind, geom: r.geom, origin: r.origin,
    checked: r.checked_at != null, rejected: r.rejected,
  }));
}

/**
 * One label checker action: move a point (`geom`), change its class, keep it
 * (`checked`), or reject / restore it. Moving or keeping marks it checked.
 */
export async function updateLabel(
  jobId: number, labelId: number,
  patch: { geom?: unknown; class_id?: unknown; checked?: unknown; rejected?: unknown },
): Promise<ReviewLabel> {
  const label = await prisma.visionLabel.findFirst({ where: { id: labelId, job_id: jobId }, include: { Source: { select: { kind: true } } } });
  if (!label) throw new VisionInputError("Label not found");
  const data: Prisma.VisionLabelUpdateInput = {};
  if (patch.geom !== undefined) {
    const g = validGeom(patch.geom, label.Source.kind);
    if (g.geom_kind !== label.geom_kind) throw new VisionInputError("A label can only be moved, not reshaped");
    data.geom = g.geom;
    data.checked_at = new Date();
  }
  if (patch.class_id !== undefined) {
    const cls = await prisma.visionClass.findFirst({ where: { id: Number(patch.class_id), job_id: jobId } });
    if (!cls) throw new VisionInputError("Class isn't part of this job");
    data.Class = { connect: { id: cls.id } };
    data.checked_at = new Date();
  }
  if (patch.checked === true) data.checked_at = new Date();
  if (patch.checked === false) data.checked_at = null;
  if (typeof patch.rejected === "boolean") {
    data.rejected = patch.rejected;
    data.checked_at = new Date();
  }
  const r = await prisma.visionLabel.update({ where: { id: labelId }, data });
  return { id: r.id, class_id: r.class_id, geom_kind: r.geom_kind, geom: r.geom, origin: r.origin, checked: r.checked_at != null, rejected: r.rejected };
}

/** Saves the job's rough object size (metres, null = not set). */
export async function setObjectSize(jobId: number, value: unknown): Promise<number | null> {
  const job = await prisma.visionJob.findUniqueOrThrow({ where: { id: jobId }, select: { settings: true } });
  const size = value == null || value === "" ? null : parseParams({ object_size_m: value }).object_size_m;
  if (value != null && value !== "" && size == null) throw new VisionInputError("Object size must be a number of metres");
  const settings = { ...((job.settings ?? {}) as Record<string, unknown>), object_size_m: size };
  await prisma.visionJob.update({ where: { id: jobId }, data: { settings: settings as Prisma.InputJsonValue } });
  return size;
}

// ── Detection review (phase 3) ───────────────────────────────────────────────
// Step through a run's ortho predictions on full-resolution chips and say
// whether each is right. A verdict becomes a training label at the
// prediction's centre (origin prediction_confirmed / prediction_rejected,
// prediction_id set), so the next run learns from it:
//   correct     → label of the predicted class
//   wrong_class → label of the class the reviewer picked
//   not_object  → background label
//   reset       → verdict and its label removed

export type ReviewFilter = {
  sourceId?: number; classId?: number; review?: "unreviewed" | "correct" | "incorrect" | "all";
  order?: "confident" | "uncertain"; offset?: number; limit?: number;
};

export async function listPredictionsForReview(runId: number, f: ReviewFilter) {
  const where: Prisma.VisionPredictionWhereInput = {
    run_id: runId,
    Source: { kind: "basemap" },
    ...(f.sourceId ? { source_id: f.sourceId } : {}),
    ...(f.classId ? { class_id: f.classId } : {}),
    ...(f.review && f.review !== "all" ? { review: f.review } : {}),
  };
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const [total, items, counts] = await Promise.all([
    prisma.visionPrediction.count({ where }),
    prisma.visionPrediction.findMany({
      where,
      orderBy: [{ score: f.order === "uncertain" ? "asc" : "desc" }, { id: "asc" }],
      skip: Math.max(f.offset ?? 0, 0),
      take: limit,
      select: { id: true, source_id: true, class_id: true, score: true, patches: true, centroid: true, bbox: true, review: true },
    }),
    prisma.visionPrediction.groupBy({ by: ["review"], where: { run_id: runId, Source: { kind: "basemap" } }, _count: true }),
  ]);
  return {
    total, items,
    reviewed: Object.fromEntries(counts.map((c) => [c.review, c._count])) as Record<string, number>,
  };
}

export async function reviewPrediction(
  jobId: number, predictionId: number,
  verdict: "correct" | "wrong_class" | "not_object" | "reset", classId: number | null, userId: string | null,
) {
  const p = await prisma.visionPrediction.findFirst({
    where: { id: predictionId, Run: { job_id: jobId } },
    include: { Source: { select: { kind: true } } },
  });
  if (!p) throw new VisionInputError("Prediction not found");
  if (p.Source.kind !== "basemap") throw new VisionInputError("Only ortho detections can be reviewed here");
  const classes = await prisma.visionClass.findMany({ where: { job_id: jobId }, select: { id: true, is_background: true } });
  const bg = classes.find((c) => c.is_background)!;
  const existing = await prisma.visionLabel.findFirst({ where: { job_id: jobId, prediction_id: p.id } });

  if (verdict === "reset") {
    if (existing) await prisma.visionLabel.delete({ where: { id: existing.id } });
    return prisma.visionPrediction.update({ where: { id: p.id }, data: { review: "unreviewed", reviewed_by_id: null } });
  }
  let labelClass: number;
  if (verdict === "correct") labelClass = p.class_id;
  else if (verdict === "not_object") labelClass = bg.id;
  else {
    if (!classId || !classes.some((c) => c.id === classId && !c.is_background)) throw new VisionInputError("Pick the right class");
    if (classId === p.class_id) throw new VisionInputError("That's the class it predicted; use Correct");
    labelClass = classId;
  }
  const data = {
    class_id: labelClass,
    geom_kind: "point",
    geom: { type: "Point", coordinates: p.centroid } as Prisma.InputJsonValue,
    origin: verdict === "correct" ? "prediction_confirmed" : "prediction_rejected",
    checked_at: new Date(),
    rejected: false,
  };
  if (existing) await prisma.visionLabel.update({ where: { id: existing.id }, data });
  else await prisma.visionLabel.create({ data: { ...data, job_id: jobId, source_id: p.source_id, prediction_id: p.id, created_by_id: userId } });
  return prisma.visionPrediction.update({
    where: { id: p.id },
    data: { review: verdict === "correct" ? "correct" : "incorrect", reviewed_by_id: userId },
  });
}
