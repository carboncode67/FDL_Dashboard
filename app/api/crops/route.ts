import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const crops = await prisma.crop.findMany({ orderBy: { id: "asc" } });
  return NextResponse.json(crops);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const crop = await prisma.crop.create({ data: body });
  return NextResponse.json(crop, { status: 201 });
}
