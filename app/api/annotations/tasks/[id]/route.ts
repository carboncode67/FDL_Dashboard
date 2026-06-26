import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canDelete, type Role } from "@/lib/roles";
import { getEditMode } from "@/lib/edit-mode";
import { deleteCvatTask } from "@/lib/cvat";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const editMode = await getEditMode();
  if (!canDelete(session.user.role as Role, editMode)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const taskId = parseInt(id);

  const task = await prisma.cvatTask.findUnique({ where: { id: taskId } });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (task.cvat_task_id) {
    await deleteCvatTask(task.cvat_task_id).catch(() => {});
  }

  await prisma.cvatTask.delete({ where: { id: taskId } });
  return new NextResponse(null, { status: 204 });
}
