import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { runWithLab } from "@/lib/lab-db";
import { assignmentWhereForContact, assignmentWhereForLabMember } from "@/lib/sampling-maps";

const INCLUDE = {
  Farm: { select: { Farm_Name: true, latitude: true, longitude: true } },
  Experiment: { select: { experiment_name: true } },
  _count: { select: { Polygons: true, Points: true } },
} as const;

// List sampling maps sent to the authenticated identity's phone (GET /api/data/sampling-maps).
// Deliberately lightweight — counts only, no geometry — so a device can see what's assigned
// without pulling every map's full polygons/points. GET /api/data/sampling-maps/[id] is the
// full-geometry "download" fetch for one map at a time, triggered by an explicit user action on
// the client (see Views/SamplingMapsListView.swift's Download button), not by this list route.
// Sampling maps can now be sent to a Contact (farmer) as well as a lab member (Planned Changes
// item 15/16), same OR-eligibility as Forms — see lib/sampling-maps.ts's assignmentWhereForContact.
export async function GET(request: Request) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;
  return runWithLab(auth.labSlug, async () => {
    const where =
      auth.kind === "contact"
        ? assignmentWhereForContact(auth.contact)
        : assignmentWhereForLabMember(auth.labMember.id);

    const maps = await prisma.samplingMap.findMany({
      where: { Assignments: where },
      include: INCLUDE,
      orderBy: { updated_at: "desc" },
    });

    return NextResponse.json(maps.map(serializeMapSummary));
  });
}

function serializeMapSummary(
  m: Prisma.SamplingMapGetPayload<{ include: typeof INCLUDE }>,
) {
  return {
    id: m.id,
    farm_id: m.farm_id,
    farm_name: m.Farm.Farm_Name,
    farm_lat: m.Farm.latitude,
    farm_lng: m.Farm.longitude,
    experiment_id: m.experiment_id,
    experiment_name: m.Experiment?.experiment_name ?? null,
    name: m.name,
    description: m.description,
    updated_at: m.updated_at,
    polygon_count: m._count.Polygons,
    point_count: m._count.Points,
    form_id: m.form_id,
  };
}
