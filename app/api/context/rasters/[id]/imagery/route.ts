import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { runWithTenant } from "@/lib/lab-db";
import { DATA_DIR } from "@/lib/data-api";
import { getEffectiveScope, scopeIncludesFarm } from "@/lib/get-user-filters";
import { ensureImageryRender, IMAGERY_MODES, RENDER_VERSION, type ImageryMode } from "@/lib/imagery-render";
import { cloudScore, farmFieldGeometries } from "@/lib/imagery-cloud";

export const runtime = "nodejs";

// Farm map Sentinel-2 imagery layer. ?mode=ndvi|rgb (default ndvi),
// ?mask=0 to keep cloudy pixels (masked by default). Plain GET returns the
// render's bounds + clear fraction (over the farm's fields, falling back to the
// whole raster); ?format=image returns the WebP itself.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const rasterId = parseInt(id);
  if (isNaN(rasterId)) return NextResponse.json({ error: "Invalid raster id" }, { status: 400 });

  const url = new URL(req.url);
  const modeParam = url.searchParams.get("mode") ?? "ndvi";
  if (!IMAGERY_MODES.includes(modeParam as ImageryMode)) {
    return NextResponse.json({ error: "mode must be ndvi or rgb" }, { status: 400 });
  }
  const mode = modeParam as ImageryMode;
  const mask = url.searchParams.get("mask") !== "0";

  const raster = await prisma.contextRaster.findUnique({
    where: { id: rasterId },
    select: { id: true, farm_id: true, product: true, filename: true, sha256: true, capture_date: true },
  });
  if (!raster || raster.product !== "Sentinel2") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const scope = await getEffectiveScope(session.user.id, session.user.category);
  if (!scopeIncludesFarm(scope, raster.farm_id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
    {
      ...render.meta,
      clearFraction,
      imageUrl: `/api/context/rasters/${raster.id}/imagery?mode=${mode}&mask=${mask ? 1 : 0}&format=image&v=${RENDER_VERSION}`,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
  });
}
