import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { id: testId } = await req.json();
  const link = await prisma.fieldTest.create({
    data: { Fields_id: parseInt(id), Tests_id: testId },
  });
  return NextResponse.json(link, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const testId = parseInt(searchParams.get("testId") ?? "0");
  await prisma.fieldTest.delete({
    where: { Tests_id_Fields_id: { Tests_id: testId, Fields_id: parseInt(id) } },
  });
  return new NextResponse(null, { status: 204 });
}
