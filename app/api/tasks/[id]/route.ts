import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, canDelete, type Role } from "@/lib/roles";
import { getEditMode } from "@/lib/edit-mode";

async function getTask(id: number) {
  return prisma.task.findUnique({
    where: { id },
    include: {
      Experiment: { select: { id: true, experiment_name: true, farm_id: true, Farm: { select: { Farm_Name: true } } } },
      Assignees:  { include: { User: { select: { id: true, name: true, email: true } } } },
      UploadLinks: true,
    },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const task = await getTask(parseInt(id));
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(task);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json() as {
    description?: string;
    classification?: string | null;
    experiment_id?: number | null;
    status?: string;
    priority?: string;
    due_date?: string | null;
  };

  const task = await prisma.task.update({
    where: { id: parseInt(id) },
    data: {
      ...(body.description    !== undefined ? { description: body.description }           : {}),
      ...(body.classification !== undefined ? { classification: body.classification }     : {}),
      ...(body.experiment_id  !== undefined ? { experiment_id: body.experiment_id }       : {}),
      ...(body.status         !== undefined ? { status: body.status }                     : {}),
      ...(body.priority       !== undefined ? { priority: body.priority }                 : {}),
      ...(body.due_date !== undefined
        ? { due_date: body.due_date ? new Date(body.due_date) : null }
        : {}),
    },
    include: {
      Assignees: { include: { User: { select: { id: true, name: true, email: true } } } },
      _count:    { select: { UploadLinks: true } },
    },
  });

  return NextResponse.json(task);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const editMode = await getEditMode();
  if (!canDelete(session.user.role as Role, editMode)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.task.delete({ where: { id: parseInt(id) } });
  return new NextResponse(null, { status: 204 });
}
