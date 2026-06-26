import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { id: userId } = await req.json();
  const link = await prisma.projectLabMember.create({
    data: { Projects_id: parseInt(id), user_id: userId },
  });
  return NextResponse.json(link, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("memberId") ?? "";
  await prisma.projectLabMember.delete({
    where: { user_id_Projects_id: { user_id: userId, Projects_id: parseInt(id) } },
  });
  return new NextResponse(null, { status: 204 });
}
