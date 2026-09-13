import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, canDelete } from "@/lib/roles";
import { getEditMode } from "@/lib/edit-mode";
import { runWithTenant } from "@/lib/lab-db";

const INCLUDE = {
  Polygons: true,
  Points: {
    include: { ExperimentTest: { include: { Test: { select: { id: true, Test_Name: true } } } } },
  },
  Farm: { select: { id: true, Farm_Name: true, latitude: true, longitude: true } },
  Experiment: {
    select: {
      id: true,
      experiment_name: true,
      ExperimentTests: { include: { Test: { select: { id: true, Test_Name: true } } } },
    },
  },
};

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const map = await prisma.samplingMap.findUnique({ where: { id: parseInt(id) }, include: INCLUDE });
  if (!map) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(map);
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { name, description, experiment_id, form_id, basemap_id, basemap_buffer_m, basemap_max_zoom } = body;

  const map = await prisma.samplingMap.update({
    where: { id: parseInt(id) },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(experiment_id !== undefined ? { experiment_id: experiment_id ? parseInt(experiment_id) : null } : {}),
      ...(form_id !== undefined ? { form_id: form_id ? parseInt(form_id) : null } : {}),
      // Planned Changes item 6.2 (raster-basemap toolset) — same "one setting per
      // map, set from the editor toolbar" pattern as form_id/proximity_radius_m above.
      ...(basemap_id !== undefined ? { basemap_id: basemap_id ? parseInt(basemap_id) : null } : {}),
      ...(basemap_buffer_m !== undefined
        ? { basemap_buffer_m: basemap_buffer_m ? Number(basemap_buffer_m) : null }
        : {}),
      ...(basemap_max_zoom !== undefined
        ? { basemap_max_zoom: basemap_max_zoom ? parseInt(basemap_max_zoom) : null }
        : {}),
    },
  });
  return NextResponse.json(map);
  });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const editMode = await getEditMode();
  if (!canDelete(session.user.role, editMode)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.samplingMap.delete({ where: { id: parseInt(id) } });
  return new NextResponse(null, { status: 204 });
  });
}
