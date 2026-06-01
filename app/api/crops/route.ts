import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const crops = await prisma.crop.findMany({ orderBy: { id: "asc" } });
  return NextResponse.json(crops);
}

export async function POST(req: Request) {
  const body = await req.json();
  const crop = await prisma.crop.create({ data: body });
  return NextResponse.json(crop, { status: 201 });
}
