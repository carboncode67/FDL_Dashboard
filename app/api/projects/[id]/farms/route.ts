import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, type Role } from "@/lib/roles";
import { runWithTenant } from "@/lib/lab-db";

// Project-side counterpart to /api/farms/[id]/projects — same ProjectFarm junction row, just
// keyed the other way (project id fixed in the URL, farm id in the body/query). Planned
// Changes item 25: farm<->project linking needs to work from both sides, not just the farm page.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { id: farmId } = await req.json();
  if (!farmId) return NextResponse.json({ error: "id required" }, { status: 400 });

  const link = await prisma.projectFarm.create({
    data: { Projects_id: parseInt(id), Farms_id: Number(farmId) },
  });
  return NextResponse.json(link, { status: 201 });
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const farmId = parseInt(searchParams.get("farmId") ?? "0");
  await prisma.projectFarm.delete({
    where: { Farms_id_Projects_id: { Farms_id: farmId, Projects_id: parseInt(id) } },
  });
  return new NextResponse(null, { status: 204 });
  });
}
