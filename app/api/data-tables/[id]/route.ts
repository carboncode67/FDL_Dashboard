import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const table = await prisma.dataTable.findUnique({
    where: { id: parseInt(id) },
    include: {
      HomeTest: { select: { id: true, Test_Name: true } },
      HomeDrone: { select: { id: true, Name: true } },
      FieldDefinitions: { orderBy: { col_index: "asc" } },
      UsedByTests: { include: { Test: { select: { id: true, Test_Name: true } } } },
    },
  });
  if (!table) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(table);
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  if (body.test_id && body.drone_id) {
    return NextResponse.json({ error: "A table can be homed to a Test or Equipment, not both" }, { status: 400 });
  }

  const table = await prisma.dataTable.update({
    where: { id: parseInt(id) },
    data: {
      name: body.name,
      description: body.description || null,
      data_processing_instructions: body.data_processing_instructions || null,
      test_id: body.test_id ? Number(body.test_id) : null,
      drone_id: body.drone_id ? Number(body.drone_id) : null,
    },
  });
  return NextResponse.json(table);
}

export async function DELETE(_: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.dataTable.delete({ where: { id: parseInt(id) } });
  return new NextResponse(null, { status: 204 });
}
