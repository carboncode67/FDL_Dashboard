import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const subs = await prisma.reportingSubscription.findMany({
    include: { Project: { select: { id: true, Project_Name: true } } },
    orderBy: { created_at: "desc" },
  });
  return NextResponse.json(subs);
}

export async function POST(req: Request) {
  const body = await req.json();
  const sub = await prisma.reportingSubscription.create({
    data: {
      project_id: body.project_id ?? null,
      emails:     body.emails,
      frequency:  body.frequency ?? "weekly",
      active:     body.active ?? true,
    },
    include: { Project: { select: { id: true, Project_Name: true } } },
  });
  return NextResponse.json(sub, { status: 201 });
}
