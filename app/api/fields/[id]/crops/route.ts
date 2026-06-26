import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { id: cropId } = await req.json();
  const link = await prisma.fieldCrop.create({
    data: { Fields_id: parseInt(id), Crops_id: cropId },
  });
  return NextResponse.json(link, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const cropId = parseInt(searchParams.get("cropId") ?? "0");
  await prisma.fieldCrop.delete({
    where: { Crops_id_Fields_id: { Crops_id: cropId, Fields_id: parseInt(id) } },
  });
  return new NextResponse(null, { status: 204 });
}
