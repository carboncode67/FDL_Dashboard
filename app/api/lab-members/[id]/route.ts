import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await prisma.labMember.findUnique({ where: { id: parseInt(id) } });
  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(member);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const member = await prisma.labMember.update({ where: { id: parseInt(id) }, data: body });
  return NextResponse.json(member);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.labMember.delete({ where: { id: parseInt(id) } });
  return new NextResponse(null, { status: 204 });
}
