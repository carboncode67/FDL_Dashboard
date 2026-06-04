import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const subs = await prisma.reportingSubscription.findMany({
    orderBy: { created_at: "desc" },
  });
  return NextResponse.json(subs);
}

export async function POST(req: Request) {
  const body = await req.json();
  const sub = await prisma.reportingSubscription.create({
    data: {
      label:       body.label,
      emails:      body.emails,
      frequency:   body.frequency ?? "weekly",
      active:      body.active ?? true,
      contact_ids: JSON.stringify(body.contact_ids ?? []),
    },
  });
  return NextResponse.json(sub, { status: 201 });
}
