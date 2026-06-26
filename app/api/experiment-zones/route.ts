import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const zones = await prisma.experimentZone.findMany({ orderBy: { id: "asc" } });
  return NextResponse.json(zones);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const zone = await prisma.experimentZone.create({ data: body });
  return NextResponse.json(zone, { status: 201 });
}
