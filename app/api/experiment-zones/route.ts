import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const zones = await prisma.experimentZone.findMany({ orderBy: { id: "asc" } });
  return NextResponse.json(zones);
}

export async function POST(req: Request) {
  const body = await req.json();
  const zone = await prisma.experimentZone.create({ data: body });
  return NextResponse.json(zone, { status: 201 });
}
