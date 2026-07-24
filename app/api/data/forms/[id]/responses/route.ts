import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { resolveFarmId, resolveFarmIdForLabMember } from "@/lib/proximity";
import { isFormVisibleToContact, isFormVisibleToLabMember, normalizeLabel } from "@/lib/forms";

type Params = { params: Promise<{ id: string }> };

// Own submission history for the authenticated identity — supports a future
// "Your Forms" view. Forms are repeatable, so this is a plain chronological
// list, not a completion state.
export async function GET(request: Request, { params }: Params) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const formId = parseInt(id);
  if (isNaN(formId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const responses = await prisma.formResponse.findMany({
    where: {
      form_id: formId,
      ...(auth.kind === "contact" ? { contact_id: auth.contact.id } : { user_id: auth.labMember.id }),
    },
    orderBy: { submitted_at: "desc" },
  });

  return NextResponse.json(
    responses.map((r) => ({ id: r.id, data: r.data, submitted_at: r.submitted_at }))
  );
}

// Submit a response. Body: { values: Record<label, string|number|boolean|null>, lat?, lng?, content_hash? }
// Submitted keys are matched to Form_Field_Definitions by normalized label —
// same validation approach as app/api/data/experiment-tests/[id]/rows.
export async function POST(request: Request, { params }: Params) {
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

  let body: {
    values?: unknown;
    lat?: unknown;
    lng?: unknown;
    content_hash?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const values = body.values;
  if (typeof values !== "object" || values === null || Array.isArray(values)) {
    return NextResponse.json({ error: "values must be an object keyed by field label" }, { status: 400 });
  }
  const lat = typeof body.lat === "number" ? body.lat : null;
  const lng = typeof body.lng === "number" ? body.lng : null;
  const contentHash = typeof body.content_hash === "string" ? body.content_hash : null;

  const submitterFilter =
    auth.kind === "contact" ? { contact_id: auth.contact.id } : { user_id: auth.labMember.id };

  // Dedup first — scoped to submitter, same as Note/Location dedup.
  if (contentHash) {
    const existing = await prisma.formResponse.findFirst({
      where: { form_id: formId, content_hash: contentHash, ...submitterFilter },
    });
    if (existing) {
      return NextResponse.json({ ok: true, duplicate: true, id: existing.id });
    }
  }

  const defs = await prisma.formFieldDefinition.findMany({
    where: { form_id: formId },
    orderBy: { col_index: "asc" },
  });

  const valuesEntries = Object.entries(values as Record<string, unknown>);
  const defByNorm = new Map(defs.map((d) => [normalizeLabel(d.label), d]));

  const data: Record<string, string | number | boolean | null> = {};
  const matchedColIndexes = new Set<number>();
  const ignoredFields: string[] = [];

  for (const [key, v] of valuesEntries) {
    const def = defByNorm.get(normalizeLabel(key));
    if (!def) {
      ignoredFields.push(key);
      continue;
    }
    matchedColIndexes.add(def.col_index);
    data[String(def.col_index)] =
      v === null || v === undefined ? null : typeof v === "number" || typeof v === "boolean" ? v : String(v);
  }

  const missing = defs.filter((d) => d.required && !matchedColIndexes.has(d.col_index)).map((d) => d.label);
  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, error: "Missing required fields", missing, ignored_fields: ignoredFields },
      { status: 422 }
    );
  }

  const farmId =
    auth.kind === "contact"
      ? await resolveFarmId(auth.contact, lat, lng)
      : await resolveFarmIdForLabMember(lat, lng);

  const response = await prisma.formResponse.create({
    data: {
      form_id: formId,
      contact_id: auth.kind === "contact" ? auth.contact.id : null,
      user_id: auth.kind === "labMember" ? auth.labMember.id : null,
      farm_id: farmId,
      data,
      content_hash: contentHash,
    },
  });

  return NextResponse.json(
    { ok: true, id: response.id, submitted_at: response.submitted_at, ignored_fields: ignoredFields },
    { status: 201 }
  );
}
