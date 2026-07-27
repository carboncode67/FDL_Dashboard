import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateOnboardingQr } from "@/lib/qr-code";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!user.bearer_token) return NextResponse.json({ error: "No token" }, { status: 404 });

  const serverUrl = process.env.FARMER_SERVER_URL ?? process.env.NEXTAUTH_URL ?? "";
  const { dataUrl } = await generateOnboardingQr(user.bearer_token);
  return NextResponse.json({ dataUrl, serverUrl, memberName: user.name });
}
