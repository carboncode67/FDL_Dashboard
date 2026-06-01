import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const treatments = await prisma.treatment.findMany({ orderBy: { id: "asc" } });
  return NextResponse.json(treatments);
}

export async function POST(req: Request) {
  const body = await req.json();
  const treatment = await prisma.treatment.create({ data: body });
  return NextResponse.json(treatment, { status: 201 });
}
