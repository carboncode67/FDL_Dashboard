import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, type Role } from "@/lib/roles";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; assignmentId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { assignmentId } = await params;
  await prisma.formAssignment.delete({ where: { id: parseInt(assignmentId) } });
  return new NextResponse(null, { status: 204 });
}
