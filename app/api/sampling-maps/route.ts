import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate } from "@/lib/roles";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const farmId = searchParams.get("farm_id");
  const experimentId = searchParams.get("experiment_id");

  const maps = await prisma.samplingMap.findMany({
    where: {
      ...(farmId ? { farm_id: parseInt(farmId) } : {}),
      ...(experimentId ? { experiment_id: parseInt(experimentId) } : {}),
    },
    include: {
      _count: { select: { Polygons: true, Points: true } },
      CreatedBy: { select: { id: true, name: true } },
    },
    orderBy: { updated_at: "desc" },
  });
  return NextResponse.json(maps);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreate(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { farm_id, experiment_id, name, description } = body;

  if (!farm_id) return NextResponse.json({ error: "farm_id is required" }, { status: 400 });
  if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const map = await prisma.samplingMap.create({
    data: {
      farm_id: parseInt(farm_id),
      experiment_id: experiment_id ? parseInt(experiment_id) : null,
      name,
      description: description ?? null,
      created_by_id: session.user.id,
    },
  });
  return NextResponse.json(map, { status: 201 });
}
