import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, canDelete, isAdmin } from "@/lib/roles";
import { getEditMode } from "@/lib/edit-mode";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const farm = await prisma.farm.findUnique({ where: { id: parseInt(id) } });
  if (!farm) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(farm);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  if ("ofe_sync_enabled" in body && !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const farm = await prisma.farm.update({ where: { id: parseInt(id) }, data: body });
  return NextResponse.json(farm);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const editMode = await getEditMode();
  if (!canDelete(session.user.role, editMode)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.farm.delete({ where: { id: parseInt(id) } });
  return new NextResponse(null, { status: 204 });
}
