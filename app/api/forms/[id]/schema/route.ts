import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, type Role } from "@/lib/roles";
import { normalizeLabel } from "@/lib/forms";
import { newFieldKey } from "@/lib/form-fields";
import { runWithTenant } from "@/lib/lab-db";

const FIELD_TYPES = new Set(["text", "number", "boolean", "date", "select", "multiselect", "photo"]);

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const defs = await prisma.formFieldDefinition.findMany({
    where: { form_id: parseInt(id), archived_at: null },
    orderBy: { col_index: "asc" },
  });
  return NextResponse.json(defs);
  });
}

// Saves the builder's field list IN PLACE, keyed by field_key (migration 088) — never
// delete+recreate, which used to renumber the col_index keys every stored response is
// keyed by and scramble or orphan their answers. Columns carrying a field_key update that
// field (a label change is remembered in previous_labels); columns without one are new
// fields — or, if their label matches an archived field, that field revived with its old
// answers. Active fields missing from the payload are archived when any response holds an
// answer for them, and only deleted outright when none does.
export async function PUT(req: Request, { params }: Params) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const formId = parseInt(id);
  const { columns } = await req.json() as {
    columns: {
      field_key?: string | null;
      col_index: number;
      field_type: string;
      label: string;
      required?: boolean;
      options?: string[] | null;
      show_when_label?: string | null;
      show_when_value?: string | null;
    }[];
  };

  // A field's label is its effective identity everywhere downstream — the
  // mobile bearer API matches submitted values back to definitions by
  // normalized label (there's no col_index in the wire payload), and the
  // Swift client keys its per-field answer state and SwiftUI row identity by
  // label too. Two fields sharing a label silently collide in both places,
  // so reject it here rather than let it save.
  const seen = new Set<string>();
  for (const c of columns) {
    const norm = normalizeLabel(c.label);
    if (seen.has(norm)) {
      return NextResponse.json(
        { error: `Duplicate field label: "${c.label}" — each field needs a unique label` },
        { status: 400 }
      );
    }
    seen.add(norm);
  }

  // Conditional-display validation: a field's show_when_label must name a
  // different field in this same form, and that parent can't itself be
  // conditional — visibility is evaluated one level deep only (no chains),
  // which also rules out cycles by construction.
  for (const c of columns) {
    if (!c.show_when_label) continue;
    const parentNorm = normalizeLabel(c.show_when_label);
    if (parentNorm === normalizeLabel(c.label)) {
      return NextResponse.json(
        { error: `Field "${c.label}" can't depend on its own answer` },
        { status: 400 },
      );
    }
    const parent = columns.find((p) => normalizeLabel(p.label) === parentNorm);
    if (!parent) {
      return NextResponse.json(
        { error: `Field "${c.label}" depends on an unknown field "${c.show_when_label}"` },
        { status: 400 },
      );
    }
    if (parent.show_when_label) {
      return NextResponse.json(
        { error: `Field "${c.label}" depends on "${parent.label}", which is itself conditional — chained conditions aren't supported` },
        { status: 400 },
      );
    }
    if (parent.col_index >= c.col_index) {
      return NextResponse.json(
        { error: `Field "${c.label}" must come after "${parent.label}" to depend on its answer` },
        { status: 400 },
      );
    }
    if (!c.show_when_value) {
      return NextResponse.json(
        { error: `Field "${c.label}" needs a value to match against "${parent.label}"` },
        { status: 400 },
      );
    }
  }

  const existing = await prisma.formFieldDefinition.findMany({ where: { form_id: formId } });
  const existingByKey = new Map(existing.map((d) => [d.field_key, d]));

  // Resolve every column to the field it saves into.
  const ordered = [...columns].sort((a, b) => a.col_index - b.col_index);
  const claimed = new Set<string>();
  const resolved: { col: (typeof columns)[number]; prior: (typeof existing)[number] | null; key: string }[] = [];
  for (const c of ordered) {
    if (c.field_key) {
      const prior = existingByKey.get(c.field_key);
      if (!prior || claimed.has(c.field_key)) {
        return NextResponse.json(
          { error: "This form was changed elsewhere since you opened it — reload the page and try again" },
          { status: 409 }
        );
      }
      claimed.add(prior.field_key);
      resolved.push({ col: c, prior, key: prior.field_key });
      continue;
    }
    const revived = existing.find(
      (d) => d.archived_at && !claimed.has(d.field_key) && normalizeLabel(d.label) === normalizeLabel(c.label)
    );
    if (revived) {
      claimed.add(revived.field_key);
      resolved.push({ col: c, prior: revived, key: revived.field_key });
    } else {
      resolved.push({ col: c, prior: null, key: newFieldKey() });
    }
  }

  const removed = existing.filter((d) => !d.archived_at && !claimed.has(d.field_key));
  const answeredKeys = new Set<string>();
  if (removed.length > 0) {
    const rows = await prisma.$queryRaw<{ key: string }[]>`
      SELECT DISTINCT k AS key
      FROM "pgntarg2udzj1f3"."Form_Responses" r, jsonb_object_keys(r.data::jsonb) AS k
      WHERE r.form_id = ${formId}`;
    for (const r of rows) answeredKeys.add(r.key);
  }

  const now = new Date();
  // One transaction — a rejected write (e.g. a field_type the DB's CHECK constraint doesn't
  // allow yet) leaves the form exactly as it was.
  await prisma.$transaction([
    ...resolved.map(({ col: c, prior, key }, i) => {
      const fields = {
        col_index: i,
        field_type: FIELD_TYPES.has(c.field_type) ? c.field_type : "text",
        label: c.label,
        required: c.required ?? false,
        options: c.field_type === "select" || c.field_type === "multiselect" ? (c.options ?? []) : Prisma.DbNull,
        show_when_label: c.show_when_label || null,
        show_when_value: c.show_when_label ? (c.show_when_value ?? null) : null,
      };
      if (!prior) {
        return prisma.formFieldDefinition.create({ data: { ...fields, form_id: formId, field_key: key } });
      }
      const renamed = normalizeLabel(prior.label) !== normalizeLabel(c.label);
      const previous_labels =
        renamed && !prior.previous_labels.some((l) => normalizeLabel(l) === normalizeLabel(prior.label))
          ? [...prior.previous_labels, prior.label]
          : prior.previous_labels;
      return prisma.formFieldDefinition.update({
        where: { id: prior.id },
        data: { ...fields, previous_labels, archived_at: null },
      });
    }),
    ...removed.map((d) =>
      answeredKeys.has(d.field_key)
        ? prisma.formFieldDefinition.update({ where: { id: d.id }, data: { archived_at: now } })
        : prisma.formFieldDefinition.delete({ where: { id: d.id } })
    ),
  ]);

  const defs = await prisma.formFieldDefinition.findMany({
    where: { form_id: formId, archived_at: null },
    orderBy: { col_index: "asc" },
  });
  return NextResponse.json(defs);
  });
}
