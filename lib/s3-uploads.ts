import { NextResponse } from "next/server";
import path from "path";
import { randomUUID } from "crypto";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  ListPartsCommand,
  UploadPartCommand,
  type Part,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { S3Upload } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { S3_BUCKET, s3Configured, s3Internal, s3Public } from "@/lib/s3";
import { startBasemapTiling } from "@/lib/basemap-source";

// Presigned multipart uploads of basemap GeoTIFFs straight to the S3 bucket
// (Garage) — docs/garage-s3-upload-plan.md, migration 093. Routes under
// app/api/s3-uploads/ do session auth + tenant binding (runWithTenant) and call
// these; everything here runs inside that tenant context. The browser side is
// lib/s3-multipart-client.ts.
//
//   initiate  -> CreateMultipartUpload + S3_Uploads row
//   sign      -> presigned UploadPart URLs, Content-Length signed per part
//   parts     -> ListParts (resume after a reload or network drop)
//   complete  -> ListParts -> CompleteMultipartUpload -> HeadObject -> Basemaps row + tiling
//   abort     -> AbortMultipartUpload
//
// Every call after initiate is limited to the uploader's own row: an upload id
// in a URL is never enough on its own.

export const MAX_S3_UPLOAD_BYTES = 20 * 1024 ** 3; // 20 GB
const MIN_PART_BYTES = 16 * 1024 ** 2; // small enough to finish inside Traefik's 60 s readTimeout on a slow uplink
const MAX_PARTS = 9000; // S3's limit is 10,000 — leave headroom
const MAX_SIGN_BATCH = 100;
const PART_URL_TTL_S = 3600;
const STALE_AFTER_MS = 48 * 3600 * 1000; // bucket lifecycle aborts at 2 days too
const BASEMAP_EXTS = new Set([".tif", ".tiff"]);

interface BasemapFormFields {
  display_name: string | null;
  crs_override_epsg: number | null;
  drone_flight_record_id: number | null;
}

function err(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function partSizeFor(bytes: number): number {
  const mib = 1024 ** 2;
  return Math.max(MIN_PART_BYTES, Math.ceil(bytes / MAX_PARTS / mib) * mib);
}

function expectedPartBytes(u: Pick<S3Upload, "bytes" | "part_size" | "part_count">, n: number): number {
  const size = Number(u.part_size);
  return n < u.part_count ? size : Number(u.bytes) - size * (u.part_count - 1);
}

function intOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function uploadJson(u: S3Upload) {
  return {
    id: u.id,
    status: u.status,
    filename: u.original_filename,
    bytes: Number(u.bytes),
    part_size: Number(u.part_size),
    part_count: u.part_count,
  };
}

// ── initiate ──────────────────────────────────────────────────────────────────

export async function initiateBasemapS3Upload(
  body: unknown,
  opts: { uploadedById: string; canAccessFarm: (farmId: number) => boolean },
): Promise<NextResponse> {
  if (!s3Configured) return err("Direct-to-storage uploads aren't configured on this server", 503);
  const b = (body ?? {}) as Record<string, unknown>;

  const farmId = intOrNull(b.farm_id);
  if (farmId == null) return err("farm_id is required", 400);
  const filename = typeof b.filename === "string" ? path.basename(b.filename).trim() : "";
  if (!filename || !BASEMAP_EXTS.has(path.extname(filename).toLowerCase())) {
    return err("A .tif/.tiff file is required", 400);
  }
  const bytes = typeof b.size === "number" ? b.size : NaN;
  if (!Number.isSafeInteger(bytes) || bytes <= 0) return err("Empty file", 400);
  if (bytes > MAX_S3_UPLOAD_BYTES) return err("File exceeds the 20 GB upload limit", 413);

  if (!opts.canAccessFarm(farmId)) return err("Farm not found", 404);
  const farm = await prisma.farm.findUnique({ where: { id: farmId }, select: { id: true, lab_id: true } });
  if (!farm) return err("Farm not found", 404);

  const fields: BasemapFormFields = {
    display_name: typeof b.display_name === "string" && b.display_name.trim() ? b.display_name.trim().slice(0, 200) : null,
    crs_override_epsg: intOrNull(b.crs_override_epsg),
    drone_flight_record_id: intOrNull(b.drone_flight_record_id),
  };

  const partSize = partSizeFor(bytes);
  const partCount = Math.ceil(bytes / partSize);
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  // Lab + farm in the key so a bucket listing (ops only — the app never lists on
  // a user's behalf) stays readable and per-lab cleanup is a prefix delete.
  const key = `basemap-sources/lab-${farm.lab_id ?? "none"}/farm-${farm.id}/${randomUUID()}_${safeName}`;

  const created = await s3Internal().send(
    new CreateMultipartUploadCommand({ Bucket: S3_BUCKET, Key: key, ContentType: "image/tiff" }),
  );
  if (!created.UploadId) return err("Storage didn't start the upload", 502);

  try {
    const row = await prisma.s3Upload.create({
      data: {
        farm_id: farm.id,
        uploaded_by_id: opts.uploadedById,
        kind: "basemap",
        s3_key: key,
        upload_id: created.UploadId,
        original_filename: filename,
        bytes: BigInt(bytes),
        part_size: BigInt(partSize),
        part_count: partCount,
        form_fields: fields as object,
      },
    });
    return NextResponse.json(uploadJson(row));
  } catch (e) {
    await s3Internal()
      .send(new AbortMultipartUploadCommand({ Bucket: S3_BUCKET, Key: key, UploadId: created.UploadId }))
      .catch(() => {});
    throw e;
  }
}

// ── lookups ───────────────────────────────────────────────────────────────────

/** The caller's own upload, or a 404 response. RLS scopes it to the lab too. */
export async function ownUpload(id: number, userId: string): Promise<S3Upload | NextResponse> {
  if (!Number.isSafeInteger(id)) return err("Not found", 404);
  const row = await prisma.s3Upload.findUnique({ where: { id } });
  if (!row || row.uploaded_by_id !== userId) return err("Not found", 404);
  return row;
}

async function listAllParts(u: S3Upload): Promise<Part[]> {
  const parts: Part[] = [];
  let marker: string | undefined;
  for (;;) {
    const res = await s3Internal().send(
      new ListPartsCommand({ Bucket: S3_BUCKET, Key: u.s3_key, UploadId: u.upload_id, PartNumberMarker: marker, MaxParts: 1000 }),
    );
    parts.push(...(res.Parts ?? []));
    if (!res.IsTruncated || res.NextPartNumberMarker == null) break;
    marker = String(res.NextPartNumberMarker);
  }
  return parts;
}

// ── sign ──────────────────────────────────────────────────────────────────────

export async function signParts(u: S3Upload, body: unknown): Promise<NextResponse> {
  if (!s3Configured) return err("Direct-to-storage uploads aren't configured on this server", 503);
  if (u.status !== "uploading") return err(`Upload is ${u.status}`, 409);
  const raw = (body as { part_numbers?: unknown } | null)?.part_numbers;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_SIGN_BATCH) {
    return err(`part_numbers must be 1–${MAX_SIGN_BATCH} part numbers`, 400);
  }
  const nums = [...new Set(raw)];
  if (!nums.every((n) => Number.isInteger(n) && n >= 1 && n <= u.part_count)) {
    return err(`Part numbers must be between 1 and ${u.part_count}`, 400);
  }

  const urls = await Promise.all(
    (nums as number[]).map(async (n) => ({
      part_number: n,
      // ContentLength is a signed header: the part must be exactly this size,
      // so the declared total (and the 20 GB cap) can't be exceeded.
      size: expectedPartBytes(u, n),
      url: await getSignedUrl(
        s3Public(),
        new UploadPartCommand({
          Bucket: S3_BUCKET,
          Key: u.s3_key,
          UploadId: u.upload_id,
          PartNumber: n,
          ContentLength: expectedPartBytes(u, n),
        }),
        { expiresIn: PART_URL_TTL_S },
      ),
    })),
  );
  // Activity marker for the stale-upload sweep.
  await prisma.s3Upload.update({ where: { id: u.id }, data: { updated_at: new Date() } });
  return NextResponse.json({ expires_in: PART_URL_TTL_S, parts: urls });
}

// ── parts (resume) ────────────────────────────────────────────────────────────

export async function listUploadedParts(u: S3Upload): Promise<NextResponse> {
  if (!s3Configured) return err("Direct-to-storage uploads aren't configured on this server", 503);
  if (u.status !== "uploading") return NextResponse.json({ ...uploadJson(u), parts: [] });
  try {
    const parts = await listAllParts(u);
    return NextResponse.json({
      ...uploadJson(u),
      // Only parts of the exact expected size count as done; anything else is re-sent.
      parts: parts
        .filter((p) => p.PartNumber != null && p.Size === expectedPartBytes(u, p.PartNumber))
        .map((p) => ({ part_number: p.PartNumber, size: p.Size })),
    });
  } catch (e) {
    if ((e as { name?: string }).name === "NoSuchUpload") {
      await prisma.s3Upload.update({ where: { id: u.id }, data: { status: "aborted", error_message: "Expired in storage" } });
      return err("Upload expired — start again", 410);
    }
    throw e;
  }
}

// ── complete ──────────────────────────────────────────────────────────────────

export async function completeBasemapS3Upload(u: S3Upload): Promise<NextResponse> {
  if (!s3Configured) return err("Direct-to-storage uploads aren't configured on this server", 503);
  if (u.status === "completed" && u.basemap_id != null) {
    const bm = await prisma.basemap.findUnique({ where: { id: u.basemap_id }, select: { id: true, tiling_status: true } });
    if (bm) return NextResponse.json({ ok: true, id: bm.id, tiling_status: bm.tiling_status });
  }
  // Claim: only one complete call proceeds.
  const claimed = await prisma.s3Upload.updateMany({ where: { id: u.id, status: "uploading" }, data: { status: "completing" } });
  if (claimed.count === 0) return err(`Upload is ${u.status}`, 409);

  const release = (message: string) =>
    prisma.s3Upload.update({ where: { id: u.id }, data: { status: "uploading", error_message: message } });

  // Use storage's own record of the parts, not the client's ETags: the client
  // never needs to read response headers (no CORS ExposeHeaders dependency) and
  // can't substitute parts.
  let parts: Part[];
  try {
    parts = await listAllParts(u);
  } catch (e) {
    await release("Couldn't list parts");
    throw e;
  }
  const byNumber = new Map(parts.map((p) => [p.PartNumber, p]));
  const missing: number[] = [];
  for (let n = 1; n <= u.part_count; n++) {
    const p = byNumber.get(n);
    if (!p || p.Size !== expectedPartBytes(u, n)) missing.push(n);
  }
  if (missing.length > 0) {
    await release(`${missing.length} part(s) missing`);
    return NextResponse.json(
      { error: `${missing.length} part(s) haven't finished uploading`, missing: missing.slice(0, 100) },
      { status: 409 },
    );
  }

  try {
    await s3Internal().send(
      new CompleteMultipartUploadCommand({
        Bucket: S3_BUCKET,
        Key: u.s3_key,
        UploadId: u.upload_id,
        MultipartUpload: {
          Parts: Array.from({ length: u.part_count }, (_, i) => ({ PartNumber: i + 1, ETag: byNumber.get(i + 1)!.ETag })),
        },
      }),
    );
    const head = await s3Internal().send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: u.s3_key }));
    if (head.ContentLength !== Number(u.bytes)) {
      throw new Error(`size mismatch: stored ${head.ContentLength}, expected ${u.bytes}`);
    }
  } catch (e) {
    console.error(`[s3-uploads] complete failed for upload ${u.id}`, e);
    await release("Storage failed to assemble the file");
    return err("Storage failed to assemble the file — try completing again", 502);
  }

  const fields = (u.form_fields ?? {}) as Partial<BasemapFormFields>;
  const basemap = await prisma.basemap.create({
    data: {
      farm_id: u.farm_id,
      drone_flight_record_id: fields.drone_flight_record_id ?? null,
      uploaded_by_id: u.uploaded_by_id,
      original_filename: u.original_filename,
      source_filename: path.posix.basename(u.s3_key),
      source_storage: "s3",
      source_s3_key: u.s3_key,
      bytes: u.bytes,
      sha256: null, // filled in by the tiling webhook (PipelineProcessor hashes on download)
      display_name: fields.display_name ?? null,
      crs_override_epsg: fields.crs_override_epsg ?? null,
      tiling_status: "pending",
    },
  });
  await prisma.s3Upload.update({
    where: { id: u.id },
    data: { status: "completed", basemap_id: basemap.id, error_message: null },
  });

  startBasemapTiling(basemap);
  return NextResponse.json({ ok: true, id: basemap.id, tiling_status: basemap.tiling_status });
}

// ── abort ─────────────────────────────────────────────────────────────────────

async function abortInStorage(u: S3Upload): Promise<void> {
  try {
    await s3Internal().send(new AbortMultipartUploadCommand({ Bucket: S3_BUCKET, Key: u.s3_key, UploadId: u.upload_id }));
  } catch (e) {
    if ((e as { name?: string }).name !== "NoSuchUpload") throw e;
  }
}

export async function abortS3Upload(u: S3Upload): Promise<NextResponse> {
  if (!s3Configured) return err("Direct-to-storage uploads aren't configured on this server", 503);
  if (u.status !== "uploading") return err(`Upload is ${u.status}`, 409);
  await abortInStorage(u);
  await prisma.s3Upload.update({ where: { id: u.id }, data: { status: "aborted", error_message: "Cancelled" } });
  return NextResponse.json({ ok: true });
}

/** Scheduler sweep: abort uploads with no activity for 48 h (the bucket's own
 *  lifecycle rule does the same in storage; this keeps the table in step). */
export async function sweepStaleS3Uploads(): Promise<number> {
  if (!s3Configured) return 0;
  const stale = await prisma.s3Upload.findMany({
    where: { status: { in: ["uploading", "completing"] }, updated_at: { lt: new Date(Date.now() - STALE_AFTER_MS) } },
    take: 200,
  });
  for (const u of stale) {
    try {
      await abortInStorage(u);
      await prisma.s3Upload.update({ where: { id: u.id }, data: { status: "aborted", error_message: "Abandoned (no activity for 48 h)" } });
    } catch (e) {
      console.error(`[s3-uploads] sweep failed for upload ${u.id}`, e);
    }
  }
  return stale.length;
}
