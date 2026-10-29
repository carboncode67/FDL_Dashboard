import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canDelete, type Role } from "@/lib/roles";
import { getEditMode } from "@/lib/edit-mode";
import { runWithTenant } from "@/lib/lab-db";

// GET returns the layer's GeoJSON FeatureCollection — the `url` the farm map's
// VectorLayer fetches (lib/map-rasters.ts farmLayerToMapRaster). Kept out of the
// page props so a large point layer doesn't bloat the server-rendered payload.
// Both handlers 404 a layer that belongs to a different farm.

async function resolve(params: Promise<{ id: string; layerId: string }>) {
  const { id, layerId } = await params;
  const farmId = parseInt(id);
  const numId = parseInt(layerId);
  if (isNaN(farmId) || isNaN(numId)) return null;
  const layer = await prisma.farmLayer.findUnique({ where: { id: numId } });
  return layer && layer.farm_id === farmId ? layer : null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; layerId: string }> },
) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const layer = await resolve(params);
  if (!layer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(layer.geojson);
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; layerId: string }> },
) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const editMode = await getEditMode();
  if (!canDelete(session.user.role as Role, editMode)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const layer = await resolve(params);
  if (!layer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // The kept-original Document (if any) stays — it's managed from the Documents tab.
  await prisma.farmLayer.delete({ where: { id: layer.id } });
  return NextResponse.json({ ok: true });
  });
}
