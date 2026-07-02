import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, canDelete } from "@/lib/roles";
import { getEditMode } from "@/lib/edit-mode";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await prisma.contact.findUnique({
    where: { id: parseInt(id) },
    include: { Farm: { select: { id: true, Farm_Name: true } } },
  });
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(contact);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const contact = await prisma.contact.update({
    where: { id: parseInt(id) },
    data: {
      name: body.name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      whatsapp: body.whatsapp ?? false,
      is_lab_member: body.is_lab_member ?? false,
      farms_id: body.farms_id ? Number(body.farms_id) : null,
      assigned_experiment_id: body.assigned_experiment_id ? Number(body.assigned_experiment_id) : null,
      experiment_nickname: body.experiment_nickname ?? null,
      channel: body.channel ?? null,
    },
  });
  return NextResponse.json(contact);
}

// Partial update, used for quick inline edits (like the channel dropdown)
// that shouldn't risk overwriting the rest of the contact's fields.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if ("channel" in body) data.channel = body.channel ?? null;
  if ("whatsapp" in body) data.whatsapp = body.whatsapp;
  if ("assigned_experiment_id" in body) {
    data.assigned_experiment_id = body.assigned_experiment_id ? Number(body.assigned_experiment_id) : null;
  }
  if ("experiment_nickname" in body) data.experiment_nickname = body.experiment_nickname ?? null;
  if ("onboarded_at" in body) data.onboarded_at = body.onboarded_at ? new Date(body.onboarded_at) : null;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }
  const contact = await prisma.contact.update({
    where: { id: parseInt(id) },
    data,
  });
  return NextResponse.json(contact);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const editMode = await getEditMode();
  if (!canDelete(session.user.role, editMode)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.contact.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ ok: true });
}
