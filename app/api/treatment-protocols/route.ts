import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const protocols = await prisma.treatmentProtocol.findMany({ orderBy: { id: "asc" } });
  return NextResponse.json(protocols);
}

export async function POST(req: Request) {
  const body = await req.json();
  const protocol = await prisma.treatmentProtocol.create({ data: body });
  return NextResponse.json(protocol, { status: 201 });
}
