import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = await prisma.taskTemplate.findMany({
    where: { test_id: null, drone_id: null },
    orderBy: { description: "asc" },
  });
  return NextResponse.json(templates);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const template = await prisma.taskTemplate.create({
    data: {
      description:    body.description,
      classification: body.classification ?? null,
      priority:       body.priority ?? "medium",
    },
  });
  return NextResponse.json(template, { status: 201 });
}
