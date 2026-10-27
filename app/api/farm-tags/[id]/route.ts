import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, canDelete, type Role } from "@/lib/roles";
import { getEditMode } from "@/lib/edit-mode";
import { runWithTenant } from "@/lib/lab-db";
import { normalizeTagName } from "@/lib/farm-tags";

// Rename — unlike creating/applying a tag, this changes it for every farm and every user's
// filter at once, so it's held to the normal edit permission.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const tagId = parseInt(id);
  const body = await req.json().catch(() => ({}));
  const name = normalizeTagName(body.name);
  if (!name) return NextResponse.json({ error: "Tag name must be 1–40 characters" }, { status: 400 });

  const clash = await prisma.farmTag.findFirst({
    where: { id: { not: tagId }, name: { equals: name, mode: "insensitive" } },
  });
  if (clash) return NextResponse.json({ error: `A tag named "${clash.name}" already exists` }, { status: 409 });

  const tag = await prisma.farmTag.update({ where: { id: tagId }, data: { name } });
  return NextResponse.json({ id: tag.id, name: tag.name });
  });
}

// Cascades to Farm_Tag_Links and User_Farm_Tag_Filters (DB-level ON DELETE CASCADE).
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const editMode = await getEditMode();
  if (!canDelete(session.user.role as Role, editMode)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.farmTag.delete({ where: { id: parseInt(id) } });
  return new NextResponse(null, { status: 204 });
  });
}
