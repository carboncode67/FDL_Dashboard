import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate } from "@/lib/roles";
import { runWithTenant } from "@/lib/lab-db";
import { processingConfigured, triggerBasemapTiling } from "@/lib/processing";
import { farmCentroidFor } from "@/lib/pipeline-farm";
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { pipeline } from "stream/promises";

// Sideload path for basemaps too large to reliably push through an HTTP
// upload (see docs/raster-tiling-plan.md's 2026-09-15 log — a real 6.3 GB
// orthomosaic hit ECONNRESET through POST /api/basemaps even after raising
// maxDuration, root cause not fully diagnosed but suspected to be somewhere
// in the Caddy/OPNsense path in front of TrueNAS dev, not Next.js itself).
// Lets a lab member drop a file directly onto a share the server already has
// mounted (BASEMAP_INTAKE_DIR) and register it here instead of uploading its
// bytes over HTTP a second time. No-op (both routes 200 with configured:
// false / a clear error) if BASEMAP_INTAKE_DIR isn't set - same convention
// as CVAT/processing feature flags elsewhere in this codebase.
export const runtime = "nodejs";
export const maxDuration = 300; // hashing an already-local file is fast; no upload happening here

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";
const INTAKE_DIR = process.env.BASEMAP_INTAKE_DIR;
const ALLOWED_EXTS = new Set([".tif", ".tiff"]);

// Every existing Basemaps.source_filename is a symlink into this dir (see
// POST below) pointing back at the real intake file - never a copy, a 6.3 GB
// file isn't worth duplicating for a "niche" feature. Resolves each symlink
// to compare against intake candidates, so already-registered files don't
// show up as available again.
async function alreadyRegisteredIntakePaths(): Promise<Set<string>> {
  const sourcesDir = path.join(DATA_DIR, "basemap-sources");
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(sourcesDir);
  } catch {
    return new Set();
  }
  const resolved = new Set<string>();
  for (const entry of entries) {
    const full = path.join(sourcesDir, entry);
    try {
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) {
        resolved.add(fs.realpathSync(full));
      }
    } catch {
      // broken symlink or race with a delete - skip, not fatal
    }
  }
  return resolved;
}

export async function GET() {
  return runWithTenant(async () => {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canCreate(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!INTAKE_DIR) {
      return NextResponse.json({ configured: false, files: [] });
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(INTAKE_DIR, { withFileTypes: true });
    } catch (err) {
      return NextResponse.json(
        { configured: true, files: [], error: `Can't read BASEMAP_INTAKE_DIR: ${(err as Error).message}` },
        { status: 500 },
      );
    }

    const registered = await alreadyRegisteredIntakePaths();

    const files = entries
      .filter((e) => e.isFile() && ALLOWED_EXTS.has(path.extname(e.name).toLowerCase()))
      .map((e) => {
        const full = path.join(INTAKE_DIR, e.name);
        const stat = fs.statSync(full);
        return {
          filename: e.name,
          bytes: stat.size,
          already_registered: registered.has(fs.realpathSync(full)),
        };
      })
      .filter((f) => !f.already_registered);

    return NextResponse.json({ configured: true, files });
  });
}

export async function POST(request: Request) {
  return runWithTenant(async () => {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canCreate(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!INTAKE_DIR) {
      return NextResponse.json({ error: "BASEMAP_INTAKE_DIR is not configured" }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const filename = typeof body?.filename === "string" ? path.basename(body.filename) : null;
    const farmId = parseInt(body?.farm_id ?? "", 10);
    const droneFlightRecordId =
      body?.drone_flight_record_id != null ? parseInt(body.drone_flight_record_id, 10) : null;

    if (!filename || !ALLOWED_EXTS.has(path.extname(filename).toLowerCase())) {
      return NextResponse.json({ error: "filename (.tif/.tiff) is required" }, { status: 400 });
    }
    if (isNaN(farmId)) {
      return NextResponse.json({ error: "farm_id is required" }, { status: 400 });
    }

    const intakePath = path.join(INTAKE_DIR, filename);
    // path.basename above already strips any ../ traversal, but double-check
    // the resolved path is still actually inside INTAKE_DIR before touching it.
    if (path.dirname(path.resolve(intakePath)) !== path.resolve(INTAKE_DIR)) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(intakePath);
    } catch {
      return NextResponse.json({ error: "File not found in intake directory" }, { status: 404 });
    }
    if (!stat.isFile() || stat.size === 0) {
      return NextResponse.json({ error: "Not a regular, non-empty file" }, { status: 400 });
    }

    const farm = await prisma.farm.findUnique({ where: { id: farmId }, select: { id: true } });
    if (!farm) return NextResponse.json({ error: "Farm not found" }, { status: 404 });

    // Hash the file where it already sits - streamed, never buffered whole
    // (same reasoning as the busboy upload route, this file can be GB-scale).
    const hash = createHash("sha256");
    await pipeline(fs.createReadStream(intakePath), hash);
    const sha256 = hash.digest("hex");

    const sourcesDir = path.join(DATA_DIR, "basemap-sources");
    fs.mkdirSync(sourcesDir, { recursive: true });
    const sourceFilename = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    // Symlink, not a copy - a multi-GB file isn't worth duplicating, and this
    // makes GET /api/files/basemap-sources/[filename] (and thus PipelineProcessor's
    // existing download_url tiling trigger below) work completely unchanged.
    fs.symlinkSync(path.resolve(intakePath), path.join(sourcesDir, sourceFilename));

    const basemap = await prisma.basemap.create({
      data: {
        farm_id: farmId,
        drone_flight_record_id: droneFlightRecordId != null && !isNaN(droneFlightRecordId) ? droneFlightRecordId : null,
        uploaded_by_id: session.user.id,
        original_filename: filename,
        source_filename: sourceFilename,
        bytes: BigInt(stat.size),
        sha256,
        tiling_status: "pending",
      },
    });

    if (processingConfigured) {
      const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
      const farmCentroid = await farmCentroidFor(farmId);
      // NOTE: this still goes over the same download_url/HTTP path that
      // ECONNRESET'd for the browser upload - sideloading only fixes the
      // upload half. Not yet confirmed whether PipelineProcessor's own fetch
      // hits the same wall; see docs/raster-tiling-plan.md.
      triggerBasemapTiling({
        basemap_id: basemap.id,
        download_url: `${baseUrl}/api/files/basemap-sources/${sourceFilename}`,
        callback_url: `${baseUrl}/api/basemaps/webhook`,
        farm_centroid: farmCentroid,
      }).catch(async (err) => {
        console.error("[basemaps/intake POST] tiling trigger failed", err);
        await prisma.basemap.update({
          where: { id: basemap.id },
          data: { tiling_status: "failed", error_message: "Failed to reach the processing machine" },
        }).catch(() => {});
      });
    }

    return NextResponse.json({ ok: true, id: basemap.id, tiling_status: basemap.tiling_status });
  });
}
