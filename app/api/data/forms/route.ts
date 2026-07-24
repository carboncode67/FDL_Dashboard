import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { assignmentWhereForContact, assignmentWhereForLabMember } from "@/lib/forms";

// List forms visible to the authenticated identity. response_count /
// last_submitted_at are informational history only — forms are repeatable,
// so there is no pending/completed gate here.
export async function GET(request: Request) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;

  const where =
    auth.kind === "contact"
      ? { is_active: true, Assignments: assignmentWhereForContact(auth.contact) }
      : { is_active: true, Assignments: assignmentWhereForLabMember(auth.labMember.id) };

  const forms = await prisma.form.findMany({
    where,
    include: { _count: { select: { FieldDefinitions: true, Responses: true } } },
    orderBy: { created_at: "desc" },
  });

  const responseFilter =
    auth.kind === "contact" ? { contact_id: auth.contact.id } : { user_id: auth.labMember.id };

  const lastSubmitted = await prisma.formResponse.groupBy({
    by: ["form_id"],
    where: { form_id: { in: forms.map((f) => f.id) }, ...responseFilter },
    _max: { submitted_at: true },
  });
  const lastSubmittedByForm = new Map(lastSubmitted.map((r) => [r.form_id, r._max.submitted_at]));

  return NextResponse.json(
    forms.map((f) => ({
      id: f.id,
      title: f.title,
      description: f.description,
      field_count: f._count.FieldDefinitions,
      response_count: f._count.Responses,
      last_submitted_at: lastSubmittedByForm.get(f.id) ?? null,
    }))
  );
}
