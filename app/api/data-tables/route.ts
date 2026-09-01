import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tables = await prisma.dataTable.findMany({
    orderBy: { name: "asc" },
    include: {
      HomeTest: { select: { id: true, Test_Name: true } },
      HomeDrone: { select: { id: true, Name: true } },
      _count: { select: { UsedByTests: true, FieldDefinitions: true } },
    },
  });

  return NextResponse.json(
    tables.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      test_id: t.test_id,
      drone_id: t.drone_id,
      homeTestName: t.HomeTest?.Test_Name ?? null,
      homeDroneName: t.HomeDrone?.Name ?? null,
      columnCount: t._count.FieldDefinitions,
      usageCount: (t.test_id ? 1 : 0) + t._count.UsedByTests,
    }))
  );
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (body.test_id && body.drone_id) {
    return NextResponse.json({ error: "A table can be homed to a Test or Equipment, not both" }, { status: 400 });
  }

  const table = await prisma.dataTable.create({
    data: {
      name: body.name,
      description: body.description || null,
      data_processing_instructions: body.data_processing_instructions || null,
      test_id: body.test_id ? Number(body.test_id) : null,
      drone_id: body.drone_id ? Number(body.drone_id) : null,
    },
  });
  return NextResponse.json(table, { status: 201 });
}
