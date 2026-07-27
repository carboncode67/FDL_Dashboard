import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit } from "@/lib/roles";
import { generateOnboardingQr } from "@/lib/qr-code";
import { sendMail } from "@/lib/mailer";
import { messageToHtml } from "@/lib/message-to-html";

/**
 * POST /api/lab-members/[id]/send-onboarding-email
 *
 * Emails a lab member a custom message with their app-connection QR code
 * (same one shown on their detail page) attached as a PNG.
 *
 * Body: { message: string }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { message } = await req.json();
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!user.bearer_token) return NextResponse.json({ error: "This member has no app access token yet — grant access first" }, { status: 400 });

  const { buffer } = await generateOnboardingQr(user.bearer_token);

  try {
    await sendMail({
      to: user.email,
      subject: "Farmers Datalab — Mobile App Access",
      html: messageToHtml(message),
      attachments: [{ filename: "qr-code.png", content: buffer, contentType: "image/png" }],
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { onboarded_at: new Date() },
  });

  return NextResponse.json({ ok: true, sent_to: user.email });
}
