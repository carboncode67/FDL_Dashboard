import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tests = await prisma.test.findMany({
    orderBy: { Planned_Date: "asc" },
    include: { TaskTemplates: true },
  });
  return NextResponse.json(tests);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { taskTemplates, ...testData } = body;
  const test = await prisma.test.create({
    data: {
      ...testData,
      ...(taskTemplates?.length
        ? { TaskTemplates: { create: taskTemplates.map((t: { description: string; classification?: string | null; priority?: string }) => ({
            description:    t.description,
            classification: t.classification ?? null,
            priority:       t.priority ?? "medium",
          })) } }
        : {}),
    },
    include: { TaskTemplates: true },
  });
  return NextResponse.json(test, { status: 201 });
}
