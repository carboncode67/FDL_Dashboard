import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getEditMode } from "@/lib/edit-mode";
import { canCreate, canDelete, type Role } from "@/lib/roles";

const VALID_FIELD_TYPES = ["text", "number", "select", "boolean"];

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

  if ("label" in body) {
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!label) return NextResponse.json({ error: "Label is required" }, { status: 400 });
    data.label = label;
  }
  if ("field_type" in body && VALID_FIELD_TYPES.includes(body.field_type)) {
    data.field_type = body.field_type;
  }
  if ("unit" in body) {
    data.unit = typeof body.unit === "string" && body.unit.trim() ? body.unit.trim() : null;
  }
  if ("options" in body) {
    data.options = Array.isArray(body.options)
      ? body.options.filter((o: unknown) => typeof o === "string" && o.trim())
      : null;
  }
  if ("sort_order" in body) data.sort_order = Number(body.sort_order) || 0;

  const metric = await prisma.categoryMetric.update({ where: { id: parseInt(id) }, data });
  return NextResponse.json(metric);
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
  await prisma.categoryMetric.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ ok: true });
}
