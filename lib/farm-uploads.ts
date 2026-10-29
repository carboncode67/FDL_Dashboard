import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { Readable } from "stream";
import Busboy from "busboy";
import { prisma } from "@/lib/prisma";
import { processingConfigured, triggerBasemapTiling } from "@/lib/processing";
import { farmCentroidFor } from "@/lib/pipeline-farm";
import { parseVectorUpload, applyEpsgTransform } from "@/lib/parse-boundaries";
import { parsePointsCsv } from "@/lib/csv-points";
import { keepAsFarmDocument } from "@/lib/farm-document-copy";
import { matchDocumentToTemplate } from "@/lib/document-template-match";
import { matchAndTriggerPipelines } from "@/lib/pipeline-match";
import { receiveDocumentUpload, MAX_DOCUMENT_BYTES } from "@/lib/document-upload";
import { authenticateUpload } from "@/lib/upload-auth";
import { cn1CardName, startYieldRun, YIELD_SOURCES_DIRNAME } from "@/lib/yield-runs";
import { runWithLab } from "@/lib/lab-db";

// Request handling behind the unified farm upload box (components/farm-data-upload.tsx),
// shared by the session-authed dashboard routes (app/api/basemaps,
// app/api/farms/[id]/{layers,boundaries,documents}) and their bearer-token twins
// under app/api/data/farms/[id]/ that OFE_Dashboard streams its own upload box
// through. Callers do auth + tenant binding; everything here runs inside that
// tenant context and returns the route's response.

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";
const BASEMAP_EXTS = new Set([".tif", ".tiff"]);

async function farmExists(farmId: number): Promise<boolean> {
  return (await prisma.farm.findUnique({ where: { id: farmId }, select: { id: true } })) != null;
}

// Streams the multipart body's one file part to `dir` with busboy, never
// buffering it in the Node heap — basemap sources run 1-5 GB (see
// raster-tiling-plan.md), the same reasoning as the recording upload route's
// use of busboy over request.formData(). A file whose extension isn't in
// `exts` is drained and reported as filename: null. Caller checks
// content-type and that request.body is present.
async function streamUploadToDisk(request: Request, dir: string, exts: Set<string>): Promise<{
  fields: Record<string, string>;
  filename: string | null;
  originalName: string | null;
  sha256: string | null;
}> {
  fs.mkdirSync(dir, { recursive: true });
  const contentType = request.headers.get("content-type") ?? "";
  return new Promise((resolve, reject) => {
      const bb = Busboy({ headers: { "content-type": contentType } });

      const fields: Record<string, string> = {};
      let filename: string | null = null;
      let originalName: string | null = null;
      let sha256: string | null = null;
      let fileWritePromise: Promise<void> | null = null;
      let rejectedEarly = false;

      bb.on("file", (_fieldname, fileStream, info) => {
        const ext = path.extname(info.filename).toLowerCase();
        if (!exts.has(ext)) {
          rejectedEarly = true;
          fileStream.resume(); // drain so busboy can finish
          return;
        }
        originalName = info.filename;
        filename = `${Date.now()}_${info.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const hash = createHash("sha256");
        const writeStream = fs.createWriteStream(path.join(dir, filename));
        fileStream.on("data", (chunk) => hash.update(chunk));
        fileStream.pipe(writeStream);
        fileWritePromise = new Promise<void>((res, rej) => {
          writeStream.on("finish", () => {
            sha256 = hash.digest("hex");
            res();
          });
          writeStream.on("error", rej);
          fileStream.on("error", rej);
        });
      });

      bb.on("field", (name, value) => {
        fields[name] = value;
      });

      bb.on("finish", async () => {
        try {
          if (fileWritePromise) await fileWritePromise;
          if (rejectedEarly) return resolve({ fields, filename: null, originalName: null, sha256: null });
          resolve({ fields, filename, originalName, sha256 });
        } catch (err) {
          reject(err);
        }
      });

      bb.on("error", reject);

      Readable.fromWeb(
        request.body as Parameters<typeof Readable.fromWeb>[0]
      ).pipe(bb);
  });
}

// ── Basemaps (GeoTIFF → PipelineProcessor tiling) ────────────────────────────

// `farmId` set = taken from the URL (the data route); otherwise read from the
// form's farm_id field (POST /api/basemaps, which predates the farm-scoped path).
export async function receiveBasemapUpload(
  request: Request,
  opts: { uploadedById: string | null; farmId?: number },
): Promise<NextResponse> {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }
    if (!request.body) {
      return NextResponse.json({ error: "No request body" }, { status: 400 });
    }

    const dir = path.join(DATA_DIR, "basemap-sources");
    const { fields, filename, originalName, sha256 } = await streamUploadToDisk(request, dir, BASEMAP_EXTS);

    if (!filename || !originalName || !sha256) {
      return NextResponse.json(
        { error: "No .tif/.tiff file received" },
        { status: 400 }
      );
    }

    const farmId = opts.farmId ?? parseInt(fields.farm_id ?? "", 10);
    if (isNaN(farmId)) {
      fs.unlinkSync(path.join(dir, filename));
      return NextResponse.json({ error: "farm_id is required" }, { status: 400 });
    }

    if (!(await farmExists(farmId))) {
      fs.unlinkSync(path.join(dir, filename));
      return NextResponse.json({ error: "Farm not found" }, { status: 404 });
    }

    const stat = fs.statSync(path.join(dir, filename));
    if (stat.size === 0) {
      fs.unlinkSync(path.join(dir, filename));
      return NextResponse.json({ error: "Empty file received" }, { status: 400 });
    }

    const droneFlightRecordId = fields.drone_flight_record_id
      ? parseInt(fields.drone_flight_record_id, 10)
      : null;

    // Unified farm upload dialog: optional layer name + uploader-named source
    // CRS (blank = let PipelineProcessor's geo_sanity work it out, as before).
    const displayName = fields.display_name?.trim() || null;
    const crsOverride = fields.crs_override_epsg ? parseInt(fields.crs_override_epsg, 10) : NaN;
    const crsOverrideEpsg = !isNaN(crsOverride) && crsOverride > 0 ? crsOverride : null;

    const basemap = await prisma.basemap.create({
      data: {
        farm_id: farmId,
        drone_flight_record_id: droneFlightRecordId != null && !isNaN(droneFlightRecordId) ? droneFlightRecordId : null,
        uploaded_by_id: opts.uploadedById,
        original_filename: originalName,
        source_filename: filename,
        bytes: BigInt(stat.size),
        sha256,
        display_name: displayName,
        crs_override_epsg: crsOverrideEpsg,
        tiling_status: "pending",
      },
    });

    if (processingConfigured) {
      const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
      const farmCentroid = await farmCentroidFor(farmId);
      triggerBasemapTiling({
        basemap_id: basemap.id,
        download_url: `${baseUrl}/api/files/basemap-sources/${filename}`,
        callback_url: `${baseUrl}/api/basemaps/webhook`,
        farm_centroid: farmCentroid,
        crs_override_epsg: crsOverrideEpsg,
      }).then(
        // Processor accepted the job — "tiling" (vs "pending" = never sent)
        // is what keeps the farm map's Retry link off a job already running.
        // updateMany + status guard: a fast job's webhook may already have set ready/failed.
        () => prisma.basemap.updateMany({ where: { id: basemap.id, tiling_status: "pending" }, data: { tiling_status: "tiling" } }).then(() => {}),
      ).catch(async (err) => {
        console.error("[basemap upload] tiling trigger failed", err);
        await prisma.basemap.update({
          where: { id: basemap.id },
          data: { tiling_status: "failed", error_message: "Failed to reach the processing machine" },
        }).catch(() => {});
      });
    }
    // If processing isn't configured, the row stays "pending" — same
    // no-op-when-unconfigured convention as automated pipelines.

    // Also keep the original as a farm Document (hard link, no extra space).
    if (fields.keep_document === "1") {
      await keepAsFarmDocument({ farmId, originalName, description: fields.description, sourcePath: path.join(dir, filename) }).catch((err) =>
        console.error("[basemap upload] keeping document copy failed", err)
      );
    }

    return NextResponse.json({ ok: true, id: basemap.id, tiling_status: basemap.tiling_status });
  } catch (err) {
    console.error("[basemap upload]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

// Re-sends a basemap that never got tiled (uploaded while PROCESSING_URL was
// unset, or the processor was unreachable) or whose tiling failed — the
// "Retry" link next to it under the farm map. A "ready" one can be re-tiled
// too (e.g. after a tiler fix); it drops off the map until the new tiles land.
// `farmId` set = 404 a basemap belonging to a different farm (the data route).
export async function retileBasemap(basemapId: number, farmId?: number): Promise<NextResponse> {
  if (!processingConfigured) {
    return NextResponse.json({ error: "No processing machine is configured (PROCESSING_URL)" }, { status: 503 });
  }

  const basemap = isNaN(basemapId) ? null : await prisma.basemap.findUnique({ where: { id: basemapId } });
  if (!basemap || (farmId != null && basemap.farm_id !== farmId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (basemap.tiling_status === "tiling") {
    return NextResponse.json({ error: "Already tiling" }, { status: 409 });
  }

  await prisma.basemap.update({
    where: { id: basemap.id },
    data: { tiling_status: "pending", error_message: null },
  });

  const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
  try {
    await triggerBasemapTiling({
      basemap_id: basemap.id,
      download_url: `${baseUrl}/api/files/basemap-sources/${basemap.source_filename}`,
      callback_url: `${baseUrl}/api/basemaps/webhook`,
      farm_centroid: await farmCentroidFor(basemap.farm_id),
      crs_override_epsg: basemap.crs_override_epsg,
    });
  } catch (err) {
    console.error("[basemaps retile]", err);
    await prisma.basemap.update({
      where: { id: basemap.id },
      data: { tiling_status: "failed", error_message: "Failed to reach the processing machine" },
    });
    return NextResponse.json({ error: "Failed to reach the processing machine" }, { status: 502 });
  }

  // Guarded: a fast job's webhook may already have set ready/failed.
  await prisma.basemap.updateMany({ where: { id: basemap.id, tiling_status: "pending" }, data: { tiling_status: "tiling" } });
  return NextResponse.json({ ok: true });
}

// ── Map layers (Farm_Layers, migration 089) ──────────────────────────────────

function geometryKind(fc: FeatureCollection): "point" | "line" | "polygon" | "mixed" {
  const kinds = new Set<string>();
  for (const f of fc.features) {
    const t = f.geometry?.type;
    if (t === "Point" || t === "MultiPoint") kinds.add("point");
    else if (t === "LineString" || t === "MultiLineString") kinds.add("line");
    else if (t === "Polygon" || t === "MultiPolygon") kinds.add("polygon");
    else if (t) kinds.add("mixed");
  }
  return kinds.size === 1 ? ([...kinds][0] as "point" | "line" | "polygon" | "mixed") : "mixed";
}

// "Map layer" choice: stores a vector file or point CSV as a named display-only
// Farm_Layers overlay, reprojected to EPSG:4326 at upload time. Buffered via
// request.formData() like the boundaries route — capped at the Documents
// limit, since the original is also kept as a farm Document when keep_document=1.
export async function receiveFarmLayerUpload(
  request: Request,
  farmId: number,
  uploadedById: string | null,
): Promise<NextResponse> {
  if (!(await farmExists(farmId))) return NextResponse.json({ error: "Farm not found" }, { status: 404 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json({ error: "File exceeds the 100MB limit" }, { status: 413 });
  }

  const epsg = parseInt((formData.get("epsg") as string | null) ?? "4326");
  if (isNaN(epsg)) return NextResponse.json({ error: "Invalid EPSG code" }, { status: 400 });

  const name = ((formData.get("name") as string | null) ?? "").trim() || file.name;
  const buffer = Buffer.from(await file.arrayBuffer());
  // .dbf/.prj/.cpg/.shx sent alongside a loose .shp
  const sidecars = await Promise.all(
    (formData.getAll("sidecar") as File[]).map(async (f) => ({ name: f.name, buffer: Buffer.from(await f.arrayBuffer()) })),
  );
  const isCsv = file.name.toLowerCase().endsWith(".csv");

  let fc: FeatureCollection;
  try {
    fc = isCsv
      ? applyEpsgTransform(parsePointsCsv(buffer.toString("utf8")), epsg)
      : await parseVectorUpload(file.name, buffer, epsg, sidecars);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Parse error";
    return NextResponse.json({ error: `Failed to parse file: ${msg}` }, { status: 400 });
  }

  fc = { type: "FeatureCollection", features: fc.features.filter((f) => f.geometry) };
  if (fc.features.length === 0) {
    return NextResponse.json({ error: "No features with geometry found in file" }, { status: 400 });
  }

  const documentId =
    formData.get("keep_document") === "1"
      ? await keepAsFarmDocument({ farmId, originalName: file.name, buffer, description: formData.get("description") as string | null })
      : null;
  if (documentId != null) {
    for (const sc of sidecars) await keepAsFarmDocument({ farmId, originalName: sc.name, buffer: sc.buffer });
  }

  const layer = await prisma.farmLayer.create({
    data: {
      farm_id: farmId,
      name,
      geometry_kind: geometryKind(fc),
      feature_count: fc.features.length,
      geojson: fc as unknown as Prisma.InputJsonValue,
      original_filename: file.name,
      source_epsg: file.name.toLowerCase().match(/\.km[lz]$/) ? 4326 : epsg,
      document_id: documentId,
      uploaded_by_id: uploadedById,
    },
  });

  return NextResponse.json({ ok: true, id: layer.id, count: layer.feature_count });
}

// ── Field boundaries (one Field per polygon) ─────────────────────────────────

export async function receiveBoundaryUpload(request: Request, farmId: number): Promise<NextResponse> {
  if (!(await farmExists(farmId))) return NextResponse.json({ error: "Farm not found" }, { status: 404 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const epsgRaw = (formData.get("epsg") as string | null) ?? "4326";
  const epsg = parseInt(epsgRaw);
  if (isNaN(epsg)) {
    return NextResponse.json({ error: "Invalid EPSG code" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // .dbf/.prj/.cpg/.shx sent alongside a loose .shp
  const sidecars = await Promise.all(
    (formData.getAll("sidecar") as File[]).map(async (f) => ({ name: f.name, buffer: Buffer.from(await f.arrayBuffer()) })),
  );

  let fc;
  try {
    fc = await parseVectorUpload(file.name, buffer, epsg, sidecars);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Parse error";
    return NextResponse.json({ error: `Failed to parse file: ${msg}` }, { status: 400 });
  }

  const polygonFeatures = fc.features.filter(
    (f): f is Feature<Polygon | MultiPolygon> =>
      f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon",
  );

  if (polygonFeatures.length === 0) {
    return NextResponse.json(
      { error: "No polygon features found in file" },
      { status: 400 },
    );
  }

  const boundarySource = `upload:${file.name}`;

  await prisma.$transaction(
    polygonFeatures.map((f, i) => {
      const p = f.properties ?? {};
      const name =
        (p.Name as string) ??
        (p.NAME as string) ??
        (p.name as string) ??
        (p.Field_Name as string) ??
        (p.FIELD_NAME as string) ??
        `Field ${i + 1}`;

      return prisma.field.create({
        data: {
          Name: name,
          geometry: JSON.stringify(f.geometry),
          boundary_source: boundarySource,
          Farms_id: farmId,
        },
      });
    }),
  );

  // Unified farm upload box: keep the original as a farm Document too.
  if (formData.get("keep_document") === "1") {
    await keepAsFarmDocument({ farmId, originalName: file.name, buffer, description: formData.get("description") as string | null });
    for (const sc of sidecars) await keepAsFarmDocument({ farmId, originalName: sc.name, buffer: sc.buffer });
  }

  return NextResponse.json({ ok: true, count: polygonFeatures.length });
}

// ── Farm Documents ───────────────────────────────────────────────────────────

export async function receiveFarmDocumentUpload(request: Request, farmId: number): Promise<NextResponse> {
  if (!(await farmExists(farmId))) return NextResponse.json({ error: "Farm not found" }, { status: 404 });

  const dir = path.join(DATA_DIR, "documents");
  const received = await receiveDocumentUpload(request, dir);
  if ("error" in received) return NextResponse.json({ error: received.error }, { status: received.status });
  const { filename, originalName, buffer, size, fields } = received;
  const description = fields.description?.trim() || undefined;

  const ext = path.extname(originalName).toLowerCase();
  const match = await matchDocumentToTemplate(buffer, ext);

  const doc = await prisma.document.create({
    data: {
      farm_id: farmId,
      filename,
      original_name: originalName,
      file_type: ext ? ext.slice(1) : "",
      file_size: size,
      description: description ?? null,
      data_table_id: match?.dataTableId ?? null,
      test_id: match?.testId ?? null,
      drone_id: match?.droneId ?? null,
    },
  });

  const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
  matchAndTriggerPipelines({
    table: "documents",
    id: doc.id,
    category: doc.category ?? null,
    project_id: doc.project_id ?? null,
    data_table_id: doc.data_table_id ?? null,
    inputFileUrl: `${baseUrl}/api/data/files/documents/${doc.id}`,
  }).catch((err) => console.error("[farm document upload] pipeline trigger failed", err));

  return NextResponse.json({ ok: true, id: doc.id, matched_data_table_id: doc.data_table_id });
}

// ── Yield cards (zipped CN1 → PipelineProcessor yieldclean) ──────────────────

// The unified box's "clean this yield card?" choice. A CN1 card is a folder,
// so it arrives zipped; streamed to DATA_DIR/yield-sources/ like a basemap
// source (cards run tens of MB, a whole display card more), checked to really
// hold a *.cn1 folder, kept as a farm Document (hard link) and sent off to be
// cleaned — see lib/yield-runs.ts.
export async function receiveYieldCardUpload(
  request: Request,
  farmId: number,
  uploadedById: string | null,
): Promise<NextResponse> {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }
    if (!request.body) return NextResponse.json({ error: "No request body" }, { status: 400 });

    const dir = path.join(DATA_DIR, YIELD_SOURCES_DIRNAME);
    const { fields, filename, originalName, sha256 } = await streamUploadToDisk(request, dir, new Set([".zip"]));
    if (!filename || !originalName || !sha256) {
      return NextResponse.json({ error: "Expected a .zip of a CN1 card (a *.cn1 folder)" }, { status: 400 });
    }
    const filePath = path.join(dir, filename);

    if (!(await farmExists(farmId))) {
      fs.unlinkSync(filePath);
      return NextResponse.json({ error: "Farm not found" }, { status: 404 });
    }
    const cardName = await cn1CardName(filePath).catch(() => null);
    if (!cardName) {
      fs.unlinkSync(filePath);
      return NextResponse.json({ error: "That zip doesn't contain a *.cn1 card folder" }, { status: 400 });
    }

    const sourceDocumentId = await keepAsFarmDocument({
      farmId, originalName, description: fields.description, sourcePath: filePath,
    }).catch((err) => {
      console.error("[yield upload] keeping document copy failed", err);
      return null;
    });

    const run = await prisma.yieldRun.create({
      data: {
        farm_id: farmId,
        original_filename: originalName,
        source_filename: filename,
        bytes: BigInt(fs.statSync(filePath).size),
        sha256,
        display_name: fields.display_name?.trim() || cardName,
        source_document_id: sourceDocumentId,
        uploaded_by_id: uploadedById,
      },
    });
    await startYieldRun(run.id);
    const after = await prisma.yieldRun.findUnique({ where: { id: run.id }, select: { status: true, error_message: true } });
    return NextResponse.json({ ok: true, id: run.id, status: after?.status, error: after?.error_message ?? null });
  } catch (err) {
    console.error("[yield upload]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

// ── Bearer-token (service) wrapper for the app/api/data/farms/[id]/ twins ────

// OFE_Dashboard is the caller: it authorizes its own user against the farm,
// then streams the request through with its FDL_SYNC_TOKEN. These write data,
// so unlike the read-only raster routes they demand an unrestricted service
// account outright rather than leaning on BEARER_SCOPE_ENFORCEMENT (whose
// "log" default would let a restricted mobile token through). Not in
// RESTRICTED_ALLOWED_ROUTES. `fn` gets the URL's farm id and the service
// user's id (recorded as uploaded_by_id); the farm itself is checked by the
// receive* handlers / fn.
export async function withServiceFarm(
  req: Request,
  params: Promise<{ id: string }>,
  fn: (farmId: number, serviceUserId: string) => Promise<NextResponse>,
): Promise<NextResponse> {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;
  if (auth.kind !== "labMember" || auth.restricted) {
    return NextResponse.json({ error: "Forbidden — service token required" }, { status: 403 });
  }
  return runWithLab(auth.labSlug, async () => {
    const { id } = await params;
    const farmId = parseInt(id);
    if (isNaN(farmId)) return NextResponse.json({ error: "Invalid farm id" }, { status: 400 });
    return fn(farmId, auth.labMember.id);
  });
}
