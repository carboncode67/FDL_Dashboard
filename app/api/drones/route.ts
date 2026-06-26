import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const drones = await prisma.drone.findMany({
    orderBy: { id: "asc" },
    include: { TaskTemplates: true },
  });
  return NextResponse.json(drones);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { taskTemplates, ...droneData } = body;
  const drone = await prisma.drone.create({
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
  return NextResponse.json(drone, { status: 201 });
}
