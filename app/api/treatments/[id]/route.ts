import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await prisma.treatment.findUnique({ where: { id: parseInt(id) } });
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(t);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const t = await prisma.treatment.update({ where: { id: parseInt(id) }, data: body });
  return NextResponse.json(t);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.treatment.delete({ where: { id: parseInt(id) } });
  return new NextResponse(null, { status: 204 });
}
