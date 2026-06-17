import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const INCLUDE = {
  TreatmentFieldDefinitions: { orderBy: { col_index: "asc" as const } },
};

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await prisma.treatment.findUnique({ where: { id: parseInt(id) }, include: INCLUDE });
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(t);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tid = parseInt(id);
  const { Treatment_Name, Description, Notes, allow_extra_rows, fieldDefs = [] } = await req.json();

  const t = await prisma.$transaction(async (tx) => {
    await tx.treatmentFieldDefinition.deleteMany({ where: { treatment_id: tid } });
    return tx.treatment.update({
      where: { id: tid },
      data: {
        Treatment_Name:  Treatment_Name || null,
        Description:     Description || null,
        Notes:           Notes || null,
        allow_extra_rows: allow_extra_rows ?? false,
        TreatmentFieldDefinitions: {
          create: (fieldDefs as { label: string; field_type: string }[]).map((def, i) => ({
            col_index:  i,
            label:      def.label,
            field_type: def.field_type || "text",
          })),
        },
      },
      include: INCLUDE,
    });
  });

  return NextResponse.json(t);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.treatment.delete({ where: { id: parseInt(id) } });
  return new NextResponse(null, { status: 204 });
}
