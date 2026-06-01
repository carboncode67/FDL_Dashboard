import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { id: memberId } = await req.json();
  const link = await prisma.projectLabMember.create({
    data: { Projects_id: parseInt(id), Lab_Members_id: memberId },
  });
  return NextResponse.json(link, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const memberId = parseInt(searchParams.get("memberId") ?? "0");
  await prisma.projectLabMember.delete({
    where: { Lab_Members_id_Projects_id: { Lab_Members_id: memberId, Projects_id: parseInt(id) } },
  });
  return new NextResponse(null, { status: 204 });
}
