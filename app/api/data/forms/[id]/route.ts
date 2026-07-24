import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { isFormVisibleToContact, isFormVisibleToLabMember } from "@/lib/forms";

// Returns a form's schema for the authenticated identity — 404 (not 403) if
// the form exists but isn't assigned to this recipient, so existence isn't leaked.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const formId = parseInt(id);
  if (isNaN(formId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const visible =
    auth.kind === "contact"
      ? await isFormVisibleToContact(formId, auth.contact)
      : await isFormVisibleToLabMember(formId, auth.labMember.id);
  if (!visible) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await prisma.form.findUnique({
    where: { id: formId, is_active: true },
    include: { FieldDefinitions: { orderBy: { col_index: "asc" } } },
  });
  if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: form.id,
    title: form.title,
    description: form.description,
    fields: form.FieldDefinitions.map((f) => ({
      col_index: f.col_index,
      field_type: f.field_type,
      label: f.label,
      required: f.required,
      options: f.options,
    })),
  });
}
