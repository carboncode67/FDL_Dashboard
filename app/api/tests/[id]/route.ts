import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const test = await prisma.test.findUnique({ where: { id: parseInt(id) } });
  if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(test);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const test = await prisma.test.update({ where: { id: parseInt(id) }, data: body });
  return NextResponse.json(test);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.test.delete({ where: { id: parseInt(id) } });
  return new NextResponse(null, { status: 204 });
}
