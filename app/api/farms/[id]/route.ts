import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const farm = await prisma.farm.findUnique({ where: { id: parseInt(id) } });
  if (!farm) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(farm);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const farm = await prisma.farm.update({ where: { id: parseInt(id) }, data: body });
  return NextResponse.json(farm);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.farm.delete({ where: { id: parseInt(id) } });
  return new NextResponse(null, { status: 204 });
}
