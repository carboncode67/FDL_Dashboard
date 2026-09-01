import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getEditMode } from "@/lib/edit-mode";
import { canCreate, canDelete, type Role } from "@/lib/roles";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user.role ?? "viewer") as Role;
  if (!canCreate(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};

  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    data.name = name;
  }
  if ("media_types" in body) {
    data.media_types = Array.isArray(body.media_types)
      ? body.media_types.filter((t: unknown) => typeof t === "string")
      : [];
  }
  if ("sort_order" in body) data.sort_order = Number(body.sort_order) || 0;

  try {
    const category = await prisma.uploadCategory.update({
      where: { id: parseInt(id) },
      data,
      include: { Metrics: { orderBy: { sort_order: "asc" } } },
    });
    return NextResponse.json(category);
  } catch {
    return NextResponse.json({ error: "A category with that name already exists" }, { status: 409 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const editMode = await getEditMode();
  const role = (session.user.role ?? "viewer") as Role;
  if (!canDelete(role, editMode)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.uploadCategory.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ ok: true });
}
