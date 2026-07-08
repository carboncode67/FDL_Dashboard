import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, type Role } from "@/lib/roles";
import { vikunjaConfigured, resolveVikunjaUserId, addVikunjaAssignee, removeVikunjaAssignee } from "@/lib/vikunja";

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

  if (vikunjaConfigured() && task?.vikunja_task_id) {
    const vikunjaTaskId = task.vikunja_task_id;
    const addedEmails = task.Assignees
      .filter((a) => user_ids.includes(a.user_id))
      .map((a) => a.User.email);
    try {
      await Promise.allSettled(
        addedEmails.map(async (email) => {
          const uid = await resolveVikunjaUserId(email);
          if (uid) await addVikunjaAssignee(vikunjaTaskId, uid);
        })
      );
    } catch (err) {
      console.warn("Vikunja assignee add failed:", err);
    }
  }

  return NextResponse.json(task);
}

// DELETE { user_id: string } — remove one assignee
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const taskId = parseInt(id);
  const { user_id } = await req.json() as { user_id: string };

  if (vikunjaConfigured()) {
    try {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: {
          vikunja_task_id: true,
          Assignees: { where: { user_id }, include: { User: { select: { email: true } } } },
        },
      });
      if (task?.vikunja_task_id && task.Assignees[0]) {
        const uid = await resolveVikunjaUserId(task.Assignees[0].User.email);
        if (uid) await removeVikunjaAssignee(task.vikunja_task_id, uid);
      }
    } catch (err) {
      console.warn("Vikunja assignee remove failed:", err);
    }
  }

  await prisma.taskAssignee.delete({
    where: { task_id_user_id: { task_id: taskId, user_id } },
  });
  return new NextResponse(null, { status: 204 });
}
