import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const farms = await prisma.farm.findMany({ orderBy: { id: "asc" } });
  return NextResponse.json(farms);
}

export async function POST(req: Request) {
  const body = await req.json();
  const farm = await prisma.farm.create({ data: body });
  return NextResponse.json(farm, { status: 201 });
}
