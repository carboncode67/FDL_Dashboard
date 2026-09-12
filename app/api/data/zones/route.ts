import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { runWithLab } from "@/lib/lab-db";

export async function GET(req: Request) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;
  return runWithLab(auth.labSlug, async () => {

  const { searchParams } = new URL(req.url);
  const farmId = searchParams.get("farm_id");

  const where = farmId ? { farm_id: parseInt(farmId) } : {};
  const zones = await prisma.experimentZone.findMany({
    where,
    select: {
      id: true,
      title: true,
      Zone_Label: true,
      Rep_Number: true,
      Boundary_Source: true,
      geometry: true,
      farm_id: true,
      Fields_id: true,
      project_id: true,
    },
    orderBy: { id: "asc" },
  });

  return NextResponse.json(zones);
  });
}

export async function POST(req: Request) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;
  return runWithLab(auth.labSlug, async () => {

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { title, farm_id, Fields_id, project_id, geometry, Boundary_Source, Zone_Label, Rep_Number } = body;

  const zone = await prisma.experimentZone.create({
    data: { title, farm_id, Fields_id, project_id, geometry, Boundary_Source, Zone_Label, Rep_Number },
  });

  return NextResponse.json(zone, { status: 201 });
  });
}
