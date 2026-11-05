import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import os from "os";
import path from "path";
import { verifyWebhookSignature } from "@/lib/webhook-auth";
import { downloadTileArchive, extractTiles } from "@/lib/basemap-tiles";

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
