import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const field = await prisma.field.findUnique({ where: { id: parseInt(id) } });
  if (!field) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(field);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const field = await prisma.field.update({ where: { id: parseInt(id) }, data: body });
  return NextResponse.json(field);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.field.delete({ where: { id: parseInt(id) } });
  return new NextResponse(null, { status: 204 });
}
