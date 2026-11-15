import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { runWithTenant } from "@/lib/lab-db";
import { getEffectiveScope, scopeIncludesFarm } from "@/lib/get-user-filters";
import { RENDER_VERSION } from "@/lib/imagery-render";
import { imageryResponse } from "@/lib/context-imagery-response";

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
  const raster = await prisma.contextRaster.findUnique({
    where: { id: rasterId },
    select: { id: true, farm_id: true, product: true, filename: true, sha256: true, capture_date: true },
  });
  if (!raster || raster.product !== "Sentinel2") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const scope = await getEffectiveScope(session.user.id, session.user.category);
  if (!scopeIncludesFarm(scope, raster.farm_id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return imageryResponse(raster, url, (mode, mask) =>
    `/api/context/rasters/${raster.id}/imagery?mode=${mode}&mask=${mask ? 1 : 0}&format=image&v=${RENDER_VERSION}`,
  );
  });
}
