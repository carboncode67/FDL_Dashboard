import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const drone = await prisma.drone.findUnique({ where: { id: parseInt(id) } });
  if (!drone) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(drone);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const drone = await prisma.drone.update({ where: { id: parseInt(id) }, data: body });
  return NextResponse.json(drone);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.drone.delete({ where: { id: parseInt(id) } });
  return new NextResponse(null, { status: 204 });
}
