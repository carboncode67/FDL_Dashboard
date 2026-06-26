import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const defs = await prisma.testFieldDefinition.findMany({
    where: { test_id: parseInt(id) },
    orderBy: { col_index: "asc" },
  });
  return NextResponse.json(defs);
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const testId = parseInt(id);
  const { columns } = await req.json() as {
    columns: { col_index: number; field_type: string; label: string }[];
  };

  await prisma.testFieldDefinition.deleteMany({ where: { test_id: testId } });

  if (columns.length > 0) {
    await prisma.testFieldDefinition.createMany({
      data: columns.map((c) => ({
        test_id:    testId,
        col_index:  c.col_index,
        field_type: c.field_type === "number" ? "number" : "text",
        label:      c.label,
      })),
    });
  }

  const defs = await prisma.testFieldDefinition.findMany({
    where: { test_id: testId },
    orderBy: { col_index: "asc" },
  });
  return NextResponse.json(defs);
}
