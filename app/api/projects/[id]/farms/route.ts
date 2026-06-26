import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { id: farmId } = await req.json();
  const link = await prisma.projectFarm.create({
    data: { Projects_id: parseInt(id), Farms_id: farmId },
  });
  return NextResponse.json(link, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const farmId = parseInt(searchParams.get("farmId") ?? "0");
  await prisma.projectFarm.delete({
    where: { Farms_id_Projects_id: { Farms_id: farmId, Projects_id: parseInt(id) } },
  });
  return new NextResponse(null, { status: 204 });
}
