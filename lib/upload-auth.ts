import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Contact } from "@prisma/client";

type AuthOk = { contact: Contact };
type AuthFail = { error: NextResponse };

export async function authenticateUpload(request: Request): Promise<AuthOk | AuthFail> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const contact = await prisma.contact.findFirst({ where: { token } });
  if (!contact) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { contact };
}
