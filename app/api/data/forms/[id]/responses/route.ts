import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { runWithLab } from "@/lib/lab-db";
import { resolveFarmId, resolveFarmIdForLabMember } from "@/lib/proximity";
import { buildFieldMatcher } from "@/lib/form-fields";
import {
  isFormVisibleToContact,
  isFormVisibleToLabMember,
  normalizeLabel,
} from "@/lib/forms";
import {
  isSamplingMapVisibleToLabMember,
  samplingMapIdForPoint,
} from "@/lib/sampling-maps";

type Params = { params: Promise<{ id: string }> };

// Own submission history for the authenticated identity — supports a future
// "Your Forms" view. Forms are repeatable, so this is a plain chronological
// list, not a completion state.
export async function GET(request: Request, { params }: Params) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;
  return runWithLab(auth.labSlug, async () => {
    const { id } = await params;
    const formId = parseInt(id);
    if (isNaN(formId))
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const responses = await prisma.formResponse.findMany({
      where: {
        form_id: formId,
        ...(auth.kind === "contact"
          ? { contact_id: auth.contact.id }
          : { user_id: auth.labMember.id }),
      },
      orderBy: { submitted_at: "desc" },
    });

    return NextResponse.json(
      responses.map((r) => ({
        id: r.id,
        data: r.data,
        submitted_at: r.submitted_at,
      })),
    );
  });
}

// Submit a response. Body: { values: Record<label, string|number|boolean|null>, lat?, lng?,
// altitude?, h_accuracy?, fix_quality?, external_gps?, content_hash? }
// Submitted keys are matched to Form_Field_Definitions by normalized label —
// same validation approach as app/api/data/experiment-tests/[id]/rows.
export async function POST(request: Request, { params }: Params) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;
  return runWithLab(auth.labSlug, async () => {
    const { id } = await params;
    const formId = parseInt(id);
    if (isNaN(formId))
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const visible =
      auth.kind === "contact"
        ? await isFormVisibleToContact(formId, auth.contact)
        : await isFormVisibleToLabMember(formId, auth.labMember.id);
    if (!visible)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    let body: {
      values?: unknown;
      lat?: unknown;
      lng?: unknown;
      altitude?: unknown;
      h_accuracy?: unknown;
      fix_quality?: unknown;
      external_gps?: unknown;
      content_hash?: unknown;
      sampling_point_id?: unknown;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const values = body.values;
    if (
      typeof values !== "object" ||
      values === null ||
      Array.isArray(values)
    ) {
      return NextResponse.json(
        { error: "values must be an object keyed by field label" },
        { status: 400 },
      );
    }
    const lat = typeof body.lat === "number" ? body.lat : null;
    const lng = typeof body.lng === "number" ? body.lng : null;
    // Planned Changes #13 (map survey CSV export) — persisted alongside the values that
    // already drove farm_id resolution below. altitude has no client sender yet (stays null);
    // fix_quality/h_accuracy are iOS-only today (see swift/CLAUDE.md's precise-GNSS section).
    const altitude = typeof body.altitude === "number" ? body.altitude : null;
    const hAccuracy = typeof body.h_accuracy === "number" ? body.h_accuracy : null;
    const fixQuality = typeof body.fix_quality === "string" ? body.fix_quality : null;
    const externalGps = typeof body.external_gps === "boolean" ? body.external_gps : null;
    const contentHash =
      typeof body.content_hash === "string" ? body.content_hash : null;

    // Lab-member-only, mirroring Sampling_Point_Collections — not re-checked against
    // SamplingMap.form_id (a queued offline submission may lag behind a since-changed map
    // linkage); only that the point exists and its map is still visible to this lab member.
    let samplingPointId: number | null = null;
    if (
      body.sampling_point_id !== undefined &&
      body.sampling_point_id !== null
    ) {
      if (
        typeof body.sampling_point_id !== "number" ||
        auth.kind !== "labMember"
      ) {
        return NextResponse.json(
          { error: "sampling_point_id must be a number, lab members only" },
          { status: 400 },
        );
      }
      const mapId = await samplingMapIdForPoint(body.sampling_point_id);
      if (
        mapId === null ||
        !(await isSamplingMapVisibleToLabMember(mapId, auth.labMember.id))
      ) {
        return NextResponse.json(
          { error: "Sampling point not found" },
          { status: 404 },
        );
      }
      samplingPointId = body.sampling_point_id;
    }

    const submitterFilter =
      auth.kind === "contact"
        ? { contact_id: auth.contact.id }
        : { user_id: auth.labMember.id };

    // Dedup first — scoped to submitter, same as Note/Location dedup.
    if (contentHash) {
      const existing = await prisma.formResponse.findFirst({
        where: {
          form_id: formId,
          content_hash: contentHash,
          ...submitterFilter,
        },
      });
      if (existing) {
        return NextResponse.json({
          ok: true,
          duplicate: true,
          id: existing.id,
        });
      }
    }

    // Archived fields and previous labels are included so a submission filled out before the
    // form was edited (queued offline on a phone) still lands every answer on the right field —
    // see lib/form-fields.ts buildFieldMatcher.
    const allDefs = await prisma.formFieldDefinition.findMany({
      where: { form_id: formId },
      orderBy: { col_index: "asc" },
    });
    const defs = allDefs.filter((d) => !d.archived_at);
    const matchField = buildFieldMatcher(allDefs);

    const valuesEntries = Object.entries(values as Record<string, unknown>);
    const defByNorm = new Map(defs.map((d) => [normalizeLabel(d.label), d]));

    const data: Record<string, string | number | boolean | string[] | null> = {};
    const matchedKeys = new Set<string>();
    const ignoredFields: string[] = [];
    let olderFormVersion = false;

    for (const [key, v] of valuesEntries) {
      const match = matchField(key);
      if (!match) {
        ignoredFields.push(key);
        continue;
      }
      const def = match.def;
      if (!match.current) olderFormVersion = true;
      matchedKeys.add(def.field_key);
      data[def.field_key] =
        v === null || v === undefined
          ? null
          : def.field_type === "multiselect"
            // Clients without native multiselect support fall back to a free-text
            // input, so accept a comma-separated string as well as an array
            // (options can't contain commas — the builder splits on them).
            ? (Array.isArray(v) ? v : String(v).split(","))
                .filter((x) => x !== null && x !== undefined)
                .map((x) => String(x).trim())
                .filter((x) => x.length > 0)
            : typeof v === "number" || typeof v === "boolean"
              ? v
              : String(v);
    }

    // Conditional fields: a field whose show_when_label/value isn't met by
    // the submitted answers is neither required nor kept — mirrors the
    // builder/mobile UIs hiding it, so a stale answer from before the
    // condition flipped (or a client that ignores show_when entirely)
    // doesn't get persisted or block submission.
    const isVisible = (d: (typeof defs)[number]): boolean => {
      if (!d.show_when_label) return true;
      const parent = defByNorm.get(normalizeLabel(d.show_when_label));
      if (!parent) return true; // parent field no longer exists — fail open
      const parentValue = data[parent.field_key];
      if (parentValue === undefined || parentValue === null) return false;
      if (Array.isArray(parentValue)) return parentValue.includes(d.show_when_value ?? "");
      return String(parentValue) === d.show_when_value;
    };
    // Only active fields' conditions apply — an archived field's answer is kept as submitted.
    for (const d of defs) {
      if (!isVisible(d)) delete data[d.field_key];
    }

    // Both apps enforce required fields before a response is ever queued, so a gap here means
    // the form changed under a queued submission (a field added or made required since). It
    // used to be a 422 the apps retried forever without telling anyone; now it's accepted and
    // flagged on the response instead.
    const missing = defs
      .filter((d) => d.required && isVisible(d) && !matchedKeys.has(d.field_key))
      .map((d) => d.label);
    if (missing.length > 0) olderFormVersion = true;

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
        sampling_point_id: samplingPointId,
        lat,
        lng,
        altitude,
        h_accuracy: hAccuracy,
        fix_quality: fixQuality,
        external_gps: externalGps,
        older_form_version: olderFormVersion,
        missing_required: missing,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        id: response.id,
        submitted_at: response.submitted_at,
        ignored_fields: ignoredFields,
        older_form_version: olderFormVersion,
        missing,
      },
      { status: 201 },
    );
  });
}
