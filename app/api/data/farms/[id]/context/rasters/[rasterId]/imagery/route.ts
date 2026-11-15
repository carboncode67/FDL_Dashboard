import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withServiceFarm } from "@/lib/farm-uploads";
import { RENDER_VERSION } from "@/lib/imagery-render";
import { imageryResponse } from "@/lib/context-imagery-response";

export const runtime = "nodejs";

// Bearer twin of GET /api/context/rasters/[id]/imagery for OFE's map, nested
// under the farm (a raster from another farm is a 404). The returned imageUrl
// is this route's own path; OFE swaps in its proxy's.
export async function GET(req: Request, { params }: { params: Promise<{ id: string; rasterId: string }> }) {
  return withServiceFarm(req, params, async (farmId) => {
    const rasterId = parseInt((await params).rasterId);
    if (isNaN(rasterId)) return NextResponse.json({ error: "Invalid raster id" }, { status: 400 });
    const raster = await prisma.contextRaster.findFirst({
      where: { id: rasterId, farm_id: farmId, product: "Sentinel2" },
      select: { id: true, farm_id: true, filename: true, sha256: true, capture_date: true },
    });
    if (!raster) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return imageryResponse(raster, new URL(req.url), (mode, mask) =>
      `/api/data/farms/${farmId}/context/rasters/${raster.id}/imagery?mode=${mode}&mask=${mask ? 1 : 0}&format=image&v=${RENDER_VERSION}`,
    );
  });
}
