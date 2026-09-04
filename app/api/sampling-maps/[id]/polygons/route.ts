import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit } from "@/lib/roles";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const samplingMapId = parseInt(id);
  const body = await req.json();
  const { label, purpose = "boundary", source = "drawn" } = body;

  // Importing a Field or ExperimentZone boundary copies its current geometry in server-side
  // (rather than trusting client-supplied geometry) so the import always reflects the real
  // boundary at import time.
  if (source === "field") {
    const field = await prisma.field.findUnique({ where: { id: parseInt(body.source_field_id) } });
    if (!field?.geometry) return NextResponse.json({ error: "Field has no boundary to import" }, { status: 400 });
    const polygon = await prisma.samplingMapPolygon.create({
      data: {
        sampling_map_id: samplingMapId,
        label: label ?? field.Name,
        purpose,
        geometry: field.geometry,
        source: "field",
        source_field_id: field.id,
      },
    });
    return NextResponse.json(polygon, { status: 201 });
  }

  if (source === "zone") {
    const zone = await prisma.experimentZone.findUnique({ where: { id: parseInt(body.source_zone_id) } });
    if (!zone?.geometry) return NextResponse.json({ error: "Zone has no boundary to import" }, { status: 400 });
    const polygon = await prisma.samplingMapPolygon.create({
      data: {
        sampling_map_id: samplingMapId,
        label: label ?? zone.Zone_Label,
        purpose,
        geometry: zone.geometry,
        source: "zone",
        source_zone_id: zone.id,
      },
    });
    return NextResponse.json(polygon, { status: 201 });
  }

  const { geometry } = body;
  if (!geometry) return NextResponse.json({ error: "geometry is required" }, { status: 400 });

  const polygon = await prisma.samplingMapPolygon.create({
    data: { sampling_map_id: samplingMapId, label: label ?? null, purpose, geometry, source: "drawn" },
  });
  return NextResponse.json(polygon, { status: 201 });
}
