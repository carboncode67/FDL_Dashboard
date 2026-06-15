import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, type Role } from "@/lib/roles";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const projectId = parseInt(id);
  const { id: experiment_id } = await req.json();

  if (!experiment_id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.farmExperiment.update({
    where: { id: Number(experiment_id) },
    data: { project_id: projectId },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const projectId = parseInt(id);
  const { searchParams } = new URL(req.url);
  const experiment_id = searchParams.get("experimentId");

  if (!experiment_id) return NextResponse.json({ error: "experimentId query param required" }, { status: 400 });

  await prisma.farmExperiment.updateMany({
    where: { id: Number(experiment_id), project_id: projectId },
    data: { project_id: null },
  });

  return NextResponse.json({ success: true });
}
