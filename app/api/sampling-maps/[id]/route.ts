import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, canDelete } from "@/lib/roles";
import { getEditMode } from "@/lib/edit-mode";
import { runWithTenant } from "@/lib/lab-db";
import fs from "fs";
import { naipPackagePath } from "@/lib/naip-package";
import { parseNaipBbox, estimateNaipTiles, NAIP_MAX_TILES, NAIP_MAX_ZOOM, NAIP_DEFAULT_MAX_ZOOM } from "@/lib/naip-bbox";

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
  const { name, description, experiment_id, form_id, proximity_radius_m, basemap_id, basemap_buffer_m, basemap_max_zoom, naip_bbox } = body;

  // null clears the box; anything else must be a sane [w,s,e,n] that isn't absurdly large to render.
  let naipBboxUpdate: { naip_bbox: number[] | typeof Prisma.DbNull } | null = null;
  if (naip_bbox !== undefined) {
    if (naip_bbox === null) {
      naipBboxUpdate = { naip_bbox: Prisma.DbNull };
    } else {
      const parsed = parseNaipBbox(naip_bbox);
      if (!parsed) return NextResponse.json({ error: "Invalid naip_bbox" }, { status: 400 });
      const maxZ = basemap_max_zoom ? Math.min(parseInt(basemap_max_zoom), NAIP_MAX_ZOOM) : NAIP_DEFAULT_MAX_ZOOM;
      if (estimateNaipTiles(parsed, maxZ).tiles > NAIP_MAX_TILES) {
        return NextResponse.json({ error: "Box is too large" }, { status: 400 });
      }
      naipBboxUpdate = { naip_bbox: parsed };
    }
  }

  const map = await prisma.samplingMap.update({
    where: { id: parseInt(id) },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(experiment_id !== undefined ? { experiment_id: experiment_id ? parseInt(experiment_id) : null } : {}),
      ...(form_id !== undefined ? { form_id: form_id ? parseInt(form_id) : null } : {}),
      // Planned Changes #13 (proximity auto-popup) — meters, null/0 means off for this map.
      ...(proximity_radius_m !== undefined
        ? { proximity_radius_m: proximity_radius_m ? Number(proximity_radius_m) : null }
        : {}),
      // Planned Changes item 6.2 (raster-basemap toolset) — same "one setting per
      // map, set from the editor toolbar" pattern as form_id/proximity_radius_m above.
      ...(basemap_id !== undefined ? { basemap_id: basemap_id ? parseInt(basemap_id) : null } : {}),
      ...(basemap_buffer_m !== undefined
        ? { basemap_buffer_m: basemap_buffer_m ? Number(basemap_buffer_m) : null }
        : {}),
      ...(basemap_max_zoom !== undefined
        ? { basemap_max_zoom: basemap_max_zoom ? parseInt(basemap_max_zoom) : null }
        : {}),
      ...(naipBboxUpdate ?? {}),
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
  fs.unlink(naipPackagePath(parseInt(id)), () => {}); // best-effort: the NAIP package, if any
  return new NextResponse(null, { status: 204 });
  });
}
