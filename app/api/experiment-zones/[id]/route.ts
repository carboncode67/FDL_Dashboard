import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const zone = await prisma.experimentZone.findUnique({ where: { id: parseInt(id) } });
  if (!zone) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(zone);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const zone = await prisma.experimentZone.update({ where: { id: parseInt(id) }, data: body });
  return NextResponse.json(zone);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.experimentZone.delete({ where: { id: parseInt(id) } });
  return new NextResponse(null, { status: 204 });
}
