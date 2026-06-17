import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ phone: string }> }) {
  const { phone } = await params;
  const clean = phone.replace(/\D/g, "").slice(-10);

  const members = await prisma.labMember.findMany();
  const match = members.find((m) => {
    const stored = (m.Contact_Phone ?? "").replace(/\D/g, "").slice(-10);
    return stored && stored === clean;
  });

  if (!match) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(match);
}
