import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import QRCode from "qrcode";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const contact = await prisma.contact.findUnique({ where: { id: parseInt(id) } });
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const serverUrl = process.env.FARMER_SERVER_URL ?? process.env.NEXTAUTH_URL ?? "";
  const payload = JSON.stringify({ url: serverUrl, token: contact.token });
  const dataUrl = await QRCode.toDataURL(payload, {
    width: 400,
    margin: 2,
    color: { dark: "#1B5E20", light: "#FFFFFF" },
  });
  return NextResponse.json({ dataUrl, serverUrl, contactName: contact.name });
}
