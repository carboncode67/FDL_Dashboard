import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const test = await prisma.test.findUnique({
    where: { id: parseInt(id) },
    include: {
      TaskTemplates: true,
      RequiredEquipment: { include: { Drone: true } },
      DataTables: true,
      UsedDataTables: { include: { DataTable: true } },
    },
  });
  if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(test);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const testId = parseInt(id);
  const body = await req.json();
  const { taskTemplates, requiredEquipmentIds, dataTableIds, ...testData } = body;

  await prisma.taskTemplate.deleteMany({ where: { test_id: testId } });
  if (requiredEquipmentIds !== undefined) {
    await prisma.testEquipment.deleteMany({ where: { Tests_id: testId } });
  }
  if (dataTableIds !== undefined) {
    await prisma.testDataTable.deleteMany({ where: { Tests_id: testId } });
  }

  const test = await prisma.test.update({
    where: { id: testId },
    data: {
      ...testData,
      ...(taskTemplates?.length
        ? { TaskTemplates: { create: taskTemplates.map((t: { description: string; classification?: string | null; priority?: string }) => ({
            description:    t.description,
            classification: t.classification ?? null,
            priority:       t.priority ?? "medium",
          })) } }
        : {}),
      ...(requiredEquipmentIds?.length
        ? { RequiredEquipment: { create: requiredEquipmentIds.map((droneId: number) => ({ Drones_id: droneId })) } }
        : {}),
      ...(dataTableIds?.length
        ? { UsedDataTables: { create: dataTableIds.map((tableId: number) => ({ Tables_id: tableId })) } }
        : {}),
    },
    include: {
      TaskTemplates: true,
      RequiredEquipment: { include: { Drone: true } },
      DataTables: true,
      UsedDataTables: { include: { DataTable: true } },
    },
  });
  return NextResponse.json(test);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.test.delete({ where: { id: parseInt(id) } });
  return new NextResponse(null, { status: 204 });
}
