import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, canDelete } from "@/lib/roles";
import { getEditMode } from "@/lib/edit-mode";
import { runWithTenant } from "@/lib/lab-db";
import { getEffectiveScope, scopeIncludesProject } from "@/lib/get-user-filters";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id: parseInt(id) } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const scope = await getEffectiveScope(session.user.id, session.user.category);
  if (!scopeIncludesProject(scope, project.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(project);
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const projectId = parseInt(id);
  const scope = await getEffectiveScope(session.user.id, session.user.category);
  if (!scopeIncludesProject(scope, projectId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const project = await prisma.project.update({ where: { id: projectId }, data: body });
  return NextResponse.json(project);
  });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const editMode = await getEditMode();
  if (!canDelete(session.user.role, editMode)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const projectId = parseInt(id);
  const scope = await getEffectiveScope(session.user.id, session.user.category);
  if (!scopeIncludesProject(scope, projectId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.project.delete({ where: { id: projectId } });
  return new NextResponse(null, { status: 204 });
  });
}
