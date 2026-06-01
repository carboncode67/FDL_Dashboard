import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.treatmentProtocol.findUnique({ where: { id: parseInt(id) } });
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(p);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const p = await prisma.treatmentProtocol.update({ where: { id: parseInt(id) }, data: body });
  return NextResponse.json(p);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.treatmentProtocol.delete({ where: { id: parseInt(id) } });
  return new NextResponse(null, { status: 204 });
}
