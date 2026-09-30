import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit, type Role } from "@/lib/roles";
import { normalizeLabel } from "@/lib/forms";
import { runWithTenant } from "@/lib/lab-db";

const FIELD_TYPES = new Set(["text", "number", "boolean", "date", "select", "photo"]);

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const defs = await prisma.formFieldDefinition.findMany({
    where: { form_id: parseInt(id) },
    orderBy: { col_index: "asc" },
  });
  return NextResponse.json(defs);
  });
}

// Full-replace, same pattern as app/api/tests/[id]/schema/route.ts.
export async function PUT(req: Request, { params }: Params) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const formId = parseInt(id);
  const { columns } = await req.json() as {
    columns: {
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

  // Delete + recreate must be one transaction — if the insert below is
  // rejected (e.g. a field_type not yet allowed by the DB's CHECK
  // constraint), a non-transactional delete would already have committed,
  // silently wiping the form's existing fields instead of failing cleanly.
  await prisma.$transaction([
    prisma.formFieldDefinition.deleteMany({ where: { form_id: formId } }),
    ...(columns.length > 0
      ? [
          prisma.formFieldDefinition.createMany({
            data: columns.map((c) => ({
              form_id: formId,
              col_index: c.col_index,
              field_type: FIELD_TYPES.has(c.field_type) ? c.field_type : "text",
              label: c.label,
              required: c.required ?? false,
              options: c.field_type === "select" ? (c.options ?? []) : undefined,
              show_when_label: c.show_when_label || null,
              show_when_value: c.show_when_label ? (c.show_when_value ?? null) : null,
            })),
          }),
        ]
      : []),
  ]);

  const defs = await prisma.formFieldDefinition.findMany({
    where: { form_id: formId },
    orderBy: { col_index: "asc" },
  });
  return NextResponse.json(defs);
  });
}
