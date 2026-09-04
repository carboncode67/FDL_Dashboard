import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { isSamplingMapVisibleToLabMember } from "@/lib/sampling-maps";

const INCLUDE = {
  Farm: { select: { Farm_Name: true, latitude: true, longitude: true } },
  Experiment: { select: { experiment_name: true } },
  Polygons: true,
  Points: {
    include: { ExperimentTest: { include: { Test: { select: { Test_Name: true } } } } },
  },
} as const;

// Single-map "download" (GET /api/data/sampling-maps/[id]) — the only route that returns full
// geometry (polygons + points). GET /api/data/sampling-maps (list) is deliberately lightweight
// (counts only); the mobile app calls this route when the user taps Download on a specific map.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;
  if (auth.kind !== "labMember") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { id } = await params;
  const mapId = parseInt(id);
  if (isNaN(mapId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const visible = await isSamplingMapVisibleToLabMember(mapId, auth.labMember.id);
  if (!visible) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const m = await prisma.samplingMap.findUnique({ where: { id: mapId }, include: INCLUDE });
  if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
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
    polygons: m.Polygons.map((p) => ({ id: p.id, label: p.label, purpose: p.purpose, geometry: p.geometry })),
    points: m.Points.map((p) => ({
      id: p.id,
      label: p.label,
      geometry: p.geometry,
      polygon_id: p.polygon_id,
      test_name: p.ExperimentTest?.Test.Test_Name ?? null,
    })),
  });
}
