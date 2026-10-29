import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withServiceFarm } from "@/lib/farm-uploads";

// Bearer twin of GET/DELETE /api/farms/[id]/layers/[layerId]: OFE's map fetches
// a layer's GeoJSON through its own session-authed proxy, and its lab members
// can remove one. Both 404 a layer that belongs to a different farm.

async function findLayer(farmId: number, layerIdRaw: string) {
  const layerId = parseInt(layerIdRaw);
  if (isNaN(layerId)) return null;
  const layer = await prisma.farmLayer.findUnique({ where: { id: layerId } });
  return layer && layer.farm_id === farmId ? layer : null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string; layerId: string }> }) {
  const { layerId } = await params;
  return withServiceFarm(req, params, async (farmId) => {
    const layer = await findLayer(farmId, layerId);
    if (!layer) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(layer.geojson);
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; layerId: string }> }) {
  const { layerId } = await params;
  return withServiceFarm(req, params, async (farmId) => {
    const layer = await findLayer(farmId, layerId);
    if (!layer) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // The kept-original Document (if any) stays, same as the session route.
    await prisma.farmLayer.delete({ where: { id: layer.id } });
    return NextResponse.json({ ok: true });
  });
}
