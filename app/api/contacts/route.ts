import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function GET() {
  const contacts = await prisma.contact.findMany({
    include: { Farm: { select: { id: true, Farm_Name: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(contacts);
}

export async function POST(req: Request) {
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
