import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Contact, LabMember } from "@prisma/client";

export type AuthResult =
  | { kind: "contact"; contact: Contact }
  | { kind: "labMember"; labMember: LabMember }
  | { error: NextResponse };

export async function authenticateUpload(request: Request): Promise<AuthResult> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const contact = await prisma.contact.findFirst({ where: { token } });
  if (contact) return { kind: "contact", contact };

  const labMember = await prisma.labMember.findFirst({ where: { token } });
  if (labMember) return { kind: "labMember", labMember };

  return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
}
