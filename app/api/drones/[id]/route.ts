import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const drone = await prisma.drone.findUnique({
    where: { id: parseInt(id) },
    include: { TaskTemplates: true },
  });
  if (!drone) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(drone);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const droneId = parseInt(id);
  const body = await req.json();
  const { taskTemplates, ...droneData } = body;

  await prisma.taskTemplate.deleteMany({ where: { drone_id: droneId } });

  const drone = await prisma.drone.update({
    where: { id: droneId },
    data: {
      ...droneData,
      ...(taskTemplates?.length
        ? { TaskTemplates: { create: taskTemplates.map((t: { description: string; classification?: string | null; priority?: string }) => ({
            description:    t.description,
            classification: t.classification ?? null,
            priority:       t.priority ?? "medium",
          })) } }
        : {}),
    },
    include: { TaskTemplates: true },
  });
  return NextResponse.json(drone);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.drone.delete({ where: { id: parseInt(id) } });
  return new NextResponse(null, { status: 204 });
}
