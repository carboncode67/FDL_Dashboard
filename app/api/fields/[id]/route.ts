import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, canDelete } from "@/lib/roles";
import { getEditMode } from "@/lib/edit-mode";
import { runWithTenant } from "@/lib/lab-db";
import { getEffectiveScope, scopeIncludesFarm } from "@/lib/get-user-filters";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const field = await prisma.field.findUnique({ where: { id: parseInt(id) } });
  if (!field) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const scope = await getEffectiveScope(session.user.id, session.user.category);
  if (!scopeIncludesFarm(scope, field.Farms_id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(field);
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.field.findUnique({ where: { id: parseInt(id) } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const scope = await getEffectiveScope(session.user.id, session.user.category);
  if (!scopeIncludesFarm(scope, existing.Farms_id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  // A body that reassigns the field to a different farm must land within scope too.
  if (body?.Farms_id != null && !scopeIncludesFarm(scope, body.Farms_id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const field = await prisma.field.update({ where: { id: parseInt(id) }, data: body });
  return NextResponse.json(field);
  });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const editMode = await getEditMode();
  if (!canDelete(session.user.role, editMode)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.field.findUnique({ where: { id: parseInt(id) } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const scope = await getEffectiveScope(session.user.id, session.user.category);
  if (!scopeIncludesFarm(scope, existing.Farms_id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.field.delete({ where: { id: parseInt(id) } });
  return new NextResponse(null, { status: 204 });
  });
}
