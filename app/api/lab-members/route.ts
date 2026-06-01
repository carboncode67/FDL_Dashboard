import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const members = await prisma.labMember.findMany({ orderBy: { id: "asc" } });
  return NextResponse.json(members);
}

export async function POST(req: Request) {
  const body = await req.json();
  const member = await prisma.labMember.create({ data: body });
  return NextResponse.json(member, { status: 201 });
}
