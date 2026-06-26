import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, type Role } from "@/lib/roles";

// POST { user_ids: string[] } — add assignees
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const taskId = parseInt(id);
  const { user_ids } = await req.json() as { user_ids: string[] };

  await prisma.taskAssignee.createMany({
    data: user_ids.map((user_id) => ({ task_id: taskId, user_id })),
    skipDuplicates: true,
  });

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { Assignees: { include: { User: { select: { id: true, name: true, email: true } } } } },
  });
  return NextResponse.json(task);
}

// DELETE { user_id: string } — remove one assignee
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { user_id } = await req.json() as { user_id: string };

  await prisma.taskAssignee.delete({
    where: { task_id_user_id: { task_id: parseInt(id), user_id } },
  });
  return new NextResponse(null, { status: 204 });
}
