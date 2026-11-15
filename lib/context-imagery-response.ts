import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { DATA_DIR } from "@/lib/data-api";
import { ensureImageryRender, IMAGERY_MODES, type ImageryMode } from "@/lib/imagery-render";
import { cloudScore, farmFieldGeometries } from "@/lib/imagery-cloud";

// The Sentinel-2 imagery render response, shared by the session route
// (/api/context/rasters/[id]/imagery) and its Data API twin for OFE_Dashboard
// (/api/data/farms/[id]/context/rasters/[rasterId]/imagery). Callers do auth
// and check the raster is a Sentinel2 row on a farm the caller may see.
// ?mode=ndvi|rgb (default ndvi), ?mask=0 keeps cloudy pixels; plain GET
// returns bounds + clear fraction, ?format=image the WebP itself.
export async function imageryResponse(
  raster: { id: number; farm_id: number; filename: string; sha256: string; capture_date: Date | null },
  url: URL,
  imageUrl: (mode: ImageryMode, mask: boolean) => string,
): Promise<NextResponse> {
  const modeParam = url.searchParams.get("mode") ?? "ndvi";
  if (!IMAGERY_MODES.includes(modeParam as ImageryMode)) {
    return NextResponse.json({ error: "mode must be ndvi or rgb" }, { status: 400 });
  }
  const mode = modeParam as ImageryMode;
  const mask = url.searchParams.get("mask") !== "0";

  const sourcePath = path.join(DATA_DIR, "context", path.basename(raster.filename));
  let render;
  try {
    render = await ensureImageryRender(sourcePath, path.parse(raster.filename).name, {
      mode,
      mask,
      captureDate: raster.capture_date,
    });
  } catch (err) {
    console.error(`[imagery] render failed for context raster ${raster.id}:`, err);
    return NextResponse.json({ error: "Imagery render failed" }, { status: 500 });
  }

  if (url.searchParams.get("format") === "image") {
    const body = await fs.readFile(render.imagePath);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": "image/webp",
        // Safe to cache: the source raster never changes for a given id, and
        // the URL carries mode, mask and RENDER_VERSION.
        "Cache-Control": "private, max-age=86400",
      },
    });
  }

  let clearFraction = render.meta.clearFraction;
  try {
    clearFraction = (await cloudScore(sourcePath, raster.sha256, await farmFieldGeometries(raster.farm_id), raster.capture_date)).clearFraction;
  } catch (err) {
    console.error(`[imagery] cloud score failed for context raster ${raster.id}:`, err);
  }

  return NextResponse.json(
    { ...render.meta, clearFraction, imageUrl: imageUrl(mode, mask) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
