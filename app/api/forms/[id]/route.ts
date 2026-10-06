import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, canDelete, type Role } from "@/lib/roles";
import { getEditMode } from "@/lib/edit-mode";
import { runWithTenant } from "@/lib/lab-db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const form = await prisma.form.findUnique({
    where: { id: parseInt(id) },
    include: { FieldDefinitions: { orderBy: { col_index: "asc" } } },
  });
  if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(form);
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json() as { title?: string; description?: string | null; is_active?: boolean };

  const form = await prisma.form.update({
    where: { id: parseInt(id) },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
    },
  });
  return NextResponse.json(form);
  });
}

// Deleting a form cascades to every response, assignment and field definition, so a form that
// has responses can only be deleted once the caller confirms the CSV export was downloaded
// (?confirm_exported=true, sent by the edit page only after its Download CSV button was used).
// This is a guard against accidental/scripted deletes, not a cryptographic proof of the download.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const editMode = await getEditMode();
  if (!canDelete(session.user.role as Role, editMode)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const formId = parseInt(id);
  const responseCount = await prisma.formResponse.count({ where: { form_id: formId } });
  const confirmed = new URL(req.url).searchParams.get("confirm_exported") === "true";
  if (responseCount > 0 && !confirmed) {
    return NextResponse.json(
      { error: `This form has ${responseCount} response(s). Download the CSV export before deleting it.` },
      { status: 409 }
    );
  }
  await prisma.form.delete({ where: { id: formId } });
  return new NextResponse(null, { status: 204 });
  });
}
