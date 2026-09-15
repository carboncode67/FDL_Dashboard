import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate } from "@/lib/roles";
import { runWithTenant } from "@/lib/lab-db";
import { processingConfigured, triggerBasemapTiling } from "@/lib/processing";
import { farmCentroidFor } from "@/lib/pipeline-farm";
import fs from "fs";
import { createHash } from "crypto";
import { Readable } from "stream";
import path from "path";
import Busboy from "busboy";

// Planned Changes items 6+7 (docs/raster-tiling-plan.md): a lab member
// uploads a large raster (typically a drone orthomosaic GeoTIFF, 1-5 GB)
// through the Dashboard UI itself. Session-authed dashboard action, not a
// mobile bearer route — no proxy.ts change needed here, same as any other
// app/api/[entity]/route.ts.
export const runtime = "nodejs";
// 300s was too short for a real multi-GB upload and caused a hard
// ECONNRESET mid-transfer (Next.js enforces maxDuration as a real request
// timeout on self-hosted deployments too, not just Vercel) - confirmed live
// against a 6.3 GB test file on TrueNAS dev, 2026-09-15. 3600s comfortably
// covers a multi-GB transfer; the real fix (presigned direct-to-storage
// upload, bypassing this request's lifecycle entirely) is tracked as a
// follow-up in docs/raster-tiling-plan.md rather than raising this forever.
export const maxDuration = 3600;

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";
const ALLOWED_EXTS = new Set([".tif", ".tiff"]);

export async function POST(request: Request) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreate(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }
    if (!request.body) {
      return NextResponse.json({ error: "No request body" }, { status: 400 });
    }

    const dir = path.join(DATA_DIR, "basemap-sources");
    fs.mkdirSync(dir, { recursive: true });

    // Streamed to disk with busboy, never buffered in the Node heap — these
    // files run 1-5 GB (see raster-tiling-plan.md), the same reasoning as the
    // recording upload route's use of busboy over request.formData().
    const { fields, filename, originalName, sha256 } = await new Promise<{
      fields: Record<string, string>;
      filename: string | null;
      originalName: string | null;
      sha256: string | null;
    }>((resolve, reject) => {
      const bb = Busboy({ headers: { "content-type": contentType } });

      const fields: Record<string, string> = {};
      let filename: string | null = null;
      let originalName: string | null = null;
      let sha256: string | null = null;
      let fileWritePromise: Promise<void> | null = null;
      let rejectedEarly = false;

      bb.on("file", (_fieldname, fileStream, info) => {
        const ext = path.extname(info.filename).toLowerCase();
        if (!ALLOWED_EXTS.has(ext)) {
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

    if (!filename || !originalName || !sha256) {
      return NextResponse.json(
        { error: "No .tif/.tiff file received" },
        { status: 400 }
      );
    }

    const farmId = parseInt(fields.farm_id ?? "", 10);
    if (isNaN(farmId)) {
      fs.unlinkSync(path.join(dir, filename));
      return NextResponse.json({ error: "farm_id is required" }, { status: 400 });
    }

    const farm = await prisma.farm.findUnique({ where: { id: farmId }, select: { id: true } });
    if (!farm) {
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

    const basemap = await prisma.basemap.create({
      data: {
        farm_id: farmId,
        drone_flight_record_id: droneFlightRecordId != null && !isNaN(droneFlightRecordId) ? droneFlightRecordId : null,
        uploaded_by_id: session.user.id,
        original_filename: originalName,
        source_filename: filename,
        bytes: BigInt(stat.size),
        sha256,
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
      }).catch(async (err) => {
        console.error("[basemaps POST] tiling trigger failed", err);
        await prisma.basemap.update({
          where: { id: basemap.id },
          data: { tiling_status: "failed", error_message: "Failed to reach the processing machine" },
        }).catch(() => {});
      });
    }
    // If processing isn't configured, the row stays "pending" — same
    // no-op-when-unconfigured convention as automated pipelines.

    return NextResponse.json({ ok: true, id: basemap.id, tiling_status: basemap.tiling_status });
  } catch (err) {
    console.error("[basemaps POST]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
  });
}
