import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const methodology = await prisma.methodology.findUnique({ where: { id: parseInt(id) } });
  if (!methodology) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(methodology);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const methodology = await prisma.methodology.update({
    where: { id: parseInt(id) },
    data: {
      title: body.title,
      body: body.body,
    },
  });
  return NextResponse.json(methodology);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.methodology.delete({ where: { id: parseInt(id) } });
  return new NextResponse(null, { status: 204 });
}
