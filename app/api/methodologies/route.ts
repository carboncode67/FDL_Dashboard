import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const methodologies = await prisma.methodology.findMany({
    orderBy: { title: "asc" },
  });
  return NextResponse.json(methodologies);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const methodology = await prisma.methodology.create({
    data: {
      title: body.title,
      body: body.body,
    },
  });
  return NextResponse.json(methodology, { status: 201 });
}
