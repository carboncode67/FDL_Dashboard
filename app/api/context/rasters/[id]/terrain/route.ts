import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { runWithTenant } from "@/lib/lab-db";
import { DATA_DIR } from "@/lib/data-api";
import { getEffectiveScope, scopeIncludesFarm } from "@/lib/get-user-filters";
import { ensureTerrainRender, RENDER_VERSION } from "@/lib/terrain-render";

export const runtime = "nodejs";

// Farm map "Terrain" layer. Plain GET returns the render's bounds + elevation
// range (what the client needs to place an imageOverlay and draw the legend);
// ?format=image returns the rendered hillshade × elevation WebP itself.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const rasterId = parseInt(id);
  if (isNaN(rasterId)) return NextResponse.json({ error: "Invalid raster id" }, { status: 400 });

  const raster = await prisma.contextRaster.findUnique({
    where: { id: rasterId },
    select: { id: true, farm_id: true, product: true, filename: true },
  });
  if (!raster || !raster.product.startsWith("USGS3DEP")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const scope = await getEffectiveScope(session.user.id, session.user.category);
  if (!scopeIncludesFarm(scope, raster.farm_id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sourcePath = path.join(DATA_DIR, "context", path.basename(raster.filename));
  let render;
  try {
    render = await ensureTerrainRender(sourcePath, path.parse(raster.filename).name);
  } catch (err) {
    console.error(`[terrain] render failed for context raster ${raster.id}:`, err);
    return NextResponse.json({ error: "Terrain render failed" }, { status: 500 });
  }

  if (new URL(req.url).searchParams.get("format") === "image") {
    const body = await fs.readFile(render.imagePath);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": "image/webp",
        // Safe to cache: the source raster never changes for a given id, and
        // the URL carries RENDER_VERSION, so an algorithm change busts it.
        "Cache-Control": "private, max-age=86400",
      },
    });
  }

  return NextResponse.json(
    { ...render.meta, imageUrl: `/api/context/rasters/${raster.id}/terrain?format=image&v=${RENDER_VERSION}` },
    { headers: { "Cache-Control": "no-store" } }
  );
  });
}
