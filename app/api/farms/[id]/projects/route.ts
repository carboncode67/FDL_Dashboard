import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, type Role } from "@/lib/roles";
import { runWithTenant } from "@/lib/lab-db";

// Planned Changes item 25: direct farm<->project linking (previously only inferable by
// assigning an experiment to a project). See also the project-side counterpart,
// /api/projects/[id]/farms, which writes to the same ProjectFarm row the other way around.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { id: projectId } = await req.json();
  if (!projectId) return NextResponse.json({ error: "id required" }, { status: 400 });

  const link = await prisma.projectFarm.create({
    data: { Projects_id: Number(projectId), Farms_id: parseInt(id) },
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
  const projectId = parseInt(searchParams.get("projectId") ?? "0");
  await prisma.projectFarm.delete({
    where: { Farms_id_Projects_id: { Farms_id: parseInt(id), Projects_id: projectId } },
  });
  return new NextResponse(null, { status: 204 });
  });
}
