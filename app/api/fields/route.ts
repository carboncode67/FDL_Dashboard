import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const fields = await prisma.field.findMany({ orderBy: { id: "asc" }, include: { Farm: true } });
  return NextResponse.json(fields);
}

export async function POST(req: Request) {
  const body = await req.json();
  const field = await prisma.field.create({ data: body });
  return NextResponse.json(field, { status: 201 });
}
