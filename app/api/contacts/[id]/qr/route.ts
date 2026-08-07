import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateOnboardingQr } from "@/lib/qr-code";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const contact = await prisma.contact.findUnique({ where: { id: parseInt(id) } });
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!contact.token) return NextResponse.json({ error: "No token" }, { status: 404 });

  const serverUrl = process.env.FARMER_SERVER_URL ?? process.env.NEXTAUTH_URL ?? "";
  const { dataUrl } = await generateOnboardingQr(contact.token);
  return NextResponse.json({ dataUrl, serverUrl, contactName: contact.name });
}
