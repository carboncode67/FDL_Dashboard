import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const tests = await prisma.test.findMany({ orderBy: { Planned_Date: "asc" } });
  return NextResponse.json(tests);
}

export async function POST(req: Request) {
  const body = await req.json();
  const test = await prisma.test.create({ data: body });
  return NextResponse.json(test, { status: 201 });
}
