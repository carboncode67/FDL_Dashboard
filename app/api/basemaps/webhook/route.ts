import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline as streamPipeline } from "stream/promises";
import yauzl from "yauzl";
import { verifyWebhookSignature } from "@/lib/webhook-auth";

// The processing machine calls this when a basemap-tiling job finishes (see
// PipelineProcessor's _do_tile_basemap). Same HMAC-over-body pattern, and the
// same PROCESSING_WEBHOOK_SECRET, as the pipelines webhook (both are called
// by PipelineProcessor) — see docs/raster-tiling-plan.md.

export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";
const TILES_DIR = path.join(DATA_DIR, "basemap-tiles");

interface BasemapWebhookPayload {
  event: "tiling_completed" | "tiling_failed";
  basemap_id: number;
  footprint?: GeoJSON.Polygon | null;
  crs_status?: "ok" | "unclear" | null;
  crs_epsg?: number | null;
  min_zoom?: number;
  max_zoom?: number;
  tile_archive_url?: string;
  error_message?: string;
}

// Streams the tile-archive zip to a temp file, authenticated the same way
// ingestOutputRasters() pulls a pipeline output — Bearer PROCESSING_API_KEY,
// the same shared secret PipelineProcessor's _check_auth expects. Streamed
// rather than buffered in memory (context-fetch.ts's downloadZip pattern):
// a real drone-orthomosaic tile pyramid can be thousands of small PNGs, and
// while PNG-compressed tiles are far smaller than the raw source raster,
// there's no reason to hold the whole archive in the Node heap either.
async function downloadTileArchive(url: string, dest: string): Promise<void> {
  const apiKey = process.env.PROCESSING_API_KEY;
  const res = await fetch(url, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} });
  if (!res.ok || !res.body) throw new Error(`tile archive download failed: ${res.status}`);
  await streamPipeline(
    Readable.fromWeb(res.body as import("stream/web").ReadableStream),
    fs.createWriteStream(dest)
  );
}

// Extracts every "<z>/<x>/<y>.png" entry from the zip into destDir, preserving
// that directory structure — same yauzl lazyEntries walk as
// context-fetch.ts's extractTifs, generalized to nested paths instead of a
// flat rename. Returns the number of tile files extracted.
function extractTiles(zipPath: string, destDir: string): Promise<number> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("bad zip"));
      let count = 0;
      zip.on("error", reject);
      zip.on("end", () => resolve(count));
      zip.on("entry", (entry) => {
        if (/\/$/.test(entry.fileName)) return zip.readEntry();
        // entry.fileName is "<z>/<x>/<y>.png", written by PipelineProcessor's
        // zipfile.write(abs_path, arcname) with tiles_dir-relative arcnames —
        // normalize + strip any leading ".." before joining, same
        // path-traversal posture as every other file-serving route here.
        const safeRel = path.normalize(entry.fileName).replace(/^(\.\.(\/|\\|$))+/, "");
        const dest = path.join(destDir, safeRel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        zip.openReadStream(entry, (e, rs) => {
          if (e || !rs) return reject(e ?? new Error("read stream"));
          const ws = fs.createWriteStream(dest);
          rs.pipe(ws);
          ws.on("error", reject);
          ws.on("finish", () => {
            count++;
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

export async function POST(req: Request) {
  const secret = process.env.PROCESSING_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const sig = req.headers.get("x-signature-256") ?? "";
  const body = await req.text();
  if (!verifyWebhookSignature(body, sig, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload: BasemapWebhookPayload = JSON.parse(body);

  const basemap = await prisma.basemap.findUnique({ where: { id: payload.basemap_id } });
  if (!basemap) return NextResponse.json({ ok: true, action: "basemap_not_found" });

  if (payload.event === "tiling_failed") {
    await prisma.basemap.update({
      where: { id: basemap.id },
      data: { tiling_status: "failed", error_message: payload.error_message ?? "Tiling failed" },
    });
    return NextResponse.json({ ok: true, action: "failed" });
  }

  // tiling_completed
  if (!payload.tile_archive_url) {
    return NextResponse.json({ ok: true, action: "ignored" });
  }

  const destDir = path.join(TILES_DIR, String(basemap.id));
  fs.mkdirSync(destDir, { recursive: true });
  const tmpZip = path.join(os.tmpdir(), `basemap-${basemap.id}-tiles-${Date.now()}.zip`);

  try {
    await downloadTileArchive(payload.tile_archive_url, tmpZip);
    await extractTiles(tmpZip, destDir);

    await prisma.basemap.update({
      where: { id: basemap.id },
      data: {
        footprint: (payload.footprint as object | null | undefined) ?? undefined,
        crs_status: payload.crs_status ?? null,
        crs_epsg: payload.crs_epsg ?? null,
        min_zoom: payload.min_zoom ?? null,
        max_zoom: payload.max_zoom ?? null,
        tile_dir: String(basemap.id),
        tiling_status: "ready",
        error_message: null,
      },
    });
    return NextResponse.json({ ok: true, action: "ready" });
  } catch (err) {
    console.error("[basemaps webhook] tile ingestion failed", err);
    await prisma.basemap.update({
      where: { id: basemap.id },
      data: { tiling_status: "failed", error_message: "Failed to ingest tile archive" },
    });
    return NextResponse.json({ ok: true, action: "ingestion_failed" });
  } finally {
    fs.unlink(tmpZip, () => {});
  }
}
