import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { assignmentWhereForLabMember } from "@/lib/sampling-maps";

const INCLUDE = {
  Farm: { select: { Farm_Name: true, latitude: true, longitude: true } },
  Experiment: { select: { experiment_name: true } },
  _count: { select: { Polygons: true, Points: true } },
} as const;

// List sampling maps sent to the authenticated lab member's phone (GET /api/data/sampling-maps).
// Deliberately lightweight — counts only, no geometry — so a device can see what's assigned
// without pulling every map's full polygons/points. GET /api/data/sampling-maps/[id] is the
// full-geometry "download" fetch for one map at a time, triggered by an explicit user action on
// the client (see Views/SamplingMapsListView.swift's Download button), not by this list route.
// Sampling maps are lab-member-only work -- a contact (farmer) token gets an empty list, same
// convention as other lab-only bearer routes returning nothing rather than an error for a kind
// that doesn't apply.
export async function GET(request: Request) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;
  if (auth.kind !== "labMember") return NextResponse.json([]);

  const maps = await prisma.samplingMap.findMany({
    where: { Assignments: assignmentWhereForLabMember(auth.labMember.id) },
    include: INCLUDE,
    orderBy: { updated_at: "desc" },
  });

  return NextResponse.json(maps.map(serializeMapSummary));
}

function serializeMapSummary(m: Prisma.SamplingMapGetPayload<{ include: typeof INCLUDE }>) {
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
  };
}
