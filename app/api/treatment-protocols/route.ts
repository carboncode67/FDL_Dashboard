import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const protocols = await prisma.treatmentProtocol.findMany({ orderBy: { id: "asc" } });
  return NextResponse.json(protocols);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const protocol = await prisma.treatmentProtocol.create({ data: body });
  return NextResponse.json(protocol, { status: 201 });
}
