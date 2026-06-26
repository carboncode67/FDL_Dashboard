import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const INCLUDE = {
  TreatmentFieldDefinitions: { orderBy: { col_index: "asc" as const } },
};

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const treatments = await prisma.treatment.findMany({
    orderBy: { Treatment_Name: "asc" },
    include: INCLUDE,
  });
  return NextResponse.json(treatments);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { Treatment_Name, Description, Notes, allow_extra_rows, fieldDefs = [] } = await req.json();
  const treatment = await prisma.treatment.create({
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
  return NextResponse.json(treatment, { status: 201 });
}
