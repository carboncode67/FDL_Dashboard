import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const crop = await prisma.crop.findUnique({ where: { id: parseInt(id) } });
  if (!crop) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(crop);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const crop = await prisma.crop.update({ where: { id: parseInt(id) }, data: body });
  return NextResponse.json(crop);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.crop.delete({ where: { id: parseInt(id) } });
  return new NextResponse(null, { status: 204 });
}
