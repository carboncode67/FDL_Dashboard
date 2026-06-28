import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, canDelete, type Role } from "@/lib/roles";
import { getEditMode } from "@/lib/edit-mode";
import { vikunjaConfigured, updateVikunjaTask, deleteVikunjaTask } from "@/lib/vikunja";

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

async function getTaskVikunjaId(id: number): Promise<number | null> {
  const t = await prisma.task.findUnique({ where: { id }, select: { vikunja_task_id: true } });
  return t?.vikunja_task_id ?? null;
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

  const numId = parseInt(id);
  const vikunjaId = vikunjaConfigured() ? await getTaskVikunjaId(numId) : null;

  const task = await prisma.task.update({
    where: { id: numId },
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

  if (vikunjaId) {
    try {
      await updateVikunjaTask(vikunjaId, {
        description: task.description,
        classification: task.classification,
        status: task.status,
        priority: task.priority,
        due_date: task.due_date,
      });
    } catch (err) {
      console.warn("Vikunja push failed (task update):", err);
    }
  }

  return NextResponse.json(task);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const editMode = await getEditMode();
  if (!canDelete(session.user.role as Role, editMode)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const numId = parseInt(id);

  if (vikunjaConfigured()) {
    const vikunjaId = await getTaskVikunjaId(numId);
    if (vikunjaId) {
      try {
        await deleteVikunjaTask(vikunjaId);
      } catch (err) {
        console.warn("Vikunja push failed (task delete):", err);
      }
    }
  }

  await prisma.task.delete({ where: { id: numId } });
  return new NextResponse(null, { status: 204 });
}
