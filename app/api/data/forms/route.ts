import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { runWithLab } from "@/lib/lab-db";
import {
  assignmentWhereForContact,
  assignmentWhereForLabMember,
  samplingMapFormWhereForLabMember,
} from "@/lib/forms";

// List forms visible to the authenticated identity. response_count /
// last_submitted_at are informational history only — forms are repeatable,
// so there is no pending/completed gate here.
export async function GET(request: Request) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;
  return runWithLab(auth.labSlug, async () => {
    // Lab members also see any form linked to a Sampling Map that's been sent to them (see
    // lib/forms.ts's samplingMapFormWhereForLabMember) — without this OR branch, such a form
    // would be fetchable individually (isFormVisibleToLabMember covers it) but would get pruned
    // from the app's local cache on every list refresh, since upsertFormDefsFromList treats this
    // response as the authoritative assigned set.
    const where =
      auth.kind === "contact"
        ? {
            is_active: true,
            Assignments: assignmentWhereForContact(auth.contact),
          }
        : {
            is_active: true,
            OR: [
              { Assignments: assignmentWhereForLabMember(auth.labMember.id) },
              {
                SamplingMaps: samplingMapFormWhereForLabMember(
                  auth.labMember.id,
                ),
              },
            ],
          };

    const forms = await prisma.form.findMany({
      where,
      include: {
        _count: { select: { FieldDefinitions: true, Responses: true } },
      },
      orderBy: { created_at: "desc" },
    });

    const responseFilter =
      auth.kind === "contact"
        ? { contact_id: auth.contact.id }
        : { user_id: auth.labMember.id };

    const lastSubmitted = await prisma.formResponse.groupBy({
      by: ["form_id"],
      where: { form_id: { in: forms.map((f) => f.id) }, ...responseFilter },
      _max: { submitted_at: true },
    });
    const lastSubmittedByForm = new Map(
      lastSubmitted.map((r) => [r.form_id, r._max.submitted_at]),
    );

    return NextResponse.json(
      forms.map((f) => ({
        id: f.id,
        title: f.title,
        description: f.description,
        field_count: f._count.FieldDefinitions,
        response_count: f._count.Responses,
        last_submitted_at: lastSubmittedByForm.get(f.id) ?? null,
      })),
    );
  });
}
