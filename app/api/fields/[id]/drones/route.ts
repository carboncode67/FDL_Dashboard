import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { id: droneId } = await req.json();
  const link = await prisma.fieldDrone.create({
    data: { Fields_id: parseInt(id), Drones_id: droneId },
  });
  return NextResponse.json(link, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const droneId = parseInt(searchParams.get("droneId") ?? "0");
  await prisma.fieldDrone.delete({
    where: { Drones_id_Fields_id: { Drones_id: droneId, Fields_id: parseInt(id) } },
  });
  return new NextResponse(null, { status: 204 });
}
