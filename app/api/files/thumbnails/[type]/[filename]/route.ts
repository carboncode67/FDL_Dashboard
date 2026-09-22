import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runWithTenant } from "@/lib/lab-db";

export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";
// Cache lives outside DATA_DIR so it can be mounted on a faster (e.g. NVMe)
// volume in production instead of the ZFS tank the originals sit on.
const THUMBNAIL_DIR = process.env.THUMBNAIL_DIR ?? "./thumbnail-cache";

// Only image-bearing tables need thumbnails; large non-image types
// (basemap-sources, pipeline-outputs, context rasters, ...) are excluded.
const ALLOWED_TYPES = ["photos"] as const;

const THUMBNAIL_MAX_DIMENSION = 320; // ~4x smaller than typical mobile-upload edge length
const THUMBNAIL_QUALITY = 70;

async function isAuthorized(req: Request): Promise<boolean> {
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Bearer ")) {
    const token = header.slice(7);
    const contact = await prisma.contact.findFirst({ where: { token }, select: { id: true } });
    if (contact) return true;
    const labMember = await prisma.user.findFirst({ where: { bearer_token: token }, select: { id: true } });
    if (labMember) return true;
    return false;
  }

  const session = await auth();
  return !!session?.user;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ type: string; filename: string }> }
) {
  return runWithTenant(async () => {
    if (!(await isAuthorized(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { type, filename } = await params;

    if (!ALLOWED_TYPES.includes(type as (typeof ALLOWED_TYPES)[number])) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const safe = path.basename(filename);
    if (!safe || safe !== filename) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    const sourcePath = path.join(DATA_DIR, type, safe);
    const cachePath = path.join(THUMBNAIL_DIR, type, `${safe}.webp`);

    // Filenames are timestamp-prefixed at upload time and never rewritten in
    // place, so a cached thumbnail never goes stale for a given filename.
    // Every fs call here is async (fs/promises) — this route can be hit by
    // dozens of concurrent <img> requests from one grid render, and a sync
    // call would block Node's single event loop for every other in-flight
    // request (including unrelated page navigations) until it returned.
    const cacheHit = await fs
      .stat(cachePath)
      .then(() => true)
      .catch(() => false);

    if (!cacheHit) {
      const sourceExists = await fs
        .stat(sourcePath)
        .then(() => true)
        .catch(() => false);
      if (!sourceExists) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }

      try {
        const buffer = await sharp(sourcePath)
          .rotate() // apply EXIF orientation before resizing
          .resize({
            width: THUMBNAIL_MAX_DIMENSION,
            height: THUMBNAIL_MAX_DIMENSION,
            fit: "cover",
          })
          .webp({ quality: THUMBNAIL_QUALITY })
          .toBuffer();

        await fs.mkdir(path.dirname(cachePath), { recursive: true });
        await fs.writeFile(cachePath, buffer);
      } catch (err) {
        // Unsupported/corrupt source image (e.g. an unrecognized format) —
        // fall back to serving the original full-resolution file so the UI
        // still shows something instead of a broken image icon. Logged
        // because this same fallback would also fire (silently, otherwise)
        // if sharp itself failed to load — e.g. its native binding missing
        // from the standalone build — masking a real infra bug as "the
        // thumbnail is just the full image".
        console.error(`Thumbnail generation failed for ${type}/${safe}:`, err);
        const original = await fs.readFile(sourcePath);
        return new NextResponse(original, {
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": "inline",
            "Cache-Control": "private, max-age=86400",
          },
        });
      }
    }

    const cached = await fs.readFile(cachePath);
    return new NextResponse(cached, {
      headers: {
        "Content-Type": "image/webp",
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  });
}
