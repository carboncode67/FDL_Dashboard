import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { runWithTenant } from "@/lib/lab-db";

// DELETE /api/message-templates/[id] — remove a template
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  await prisma.messageTemplate.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ ok: true });
  });
}
