import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate } from "@/lib/roles";
import crypto from "crypto";

function isServiceToken(req: Request): boolean {
  const svc = process.env.FDL_SERVICE_TOKEN;
  if (!svc) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${svc}`;
}

export async function GET(req: Request) {
  if (!isServiceToken(req)) {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contacts = await prisma.contact.findMany({
    include: { Farm: { select: { id: true, Farm_Name: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(contacts);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreate(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const token = crypto.randomBytes(32).toString("hex");
  const contact = await prisma.contact.create({
    data: {
      name: body.name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      whatsapp: body.whatsapp ?? false,
      is_lab_member: body.is_lab_member ?? false,
      farms_id: body.farms_id ? Number(body.farms_id) : null,
      token,
    },
  });
  return NextResponse.json(contact, { status: 201 });
}
