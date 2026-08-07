import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit } from "@/lib/roles";
import { generateOnboardingQr } from "@/lib/qr-code";
import { sendMail } from "@/lib/mailer";
import { messageToHtml } from "@/lib/message-to-html";

/**
 * POST /api/contacts/[id]/send-onboarding-email
 *
 * Standalone onboarding channel — independent of the WhatsApp/SMS flow on
 * the Messaging page. Emails the contact a custom message with the same
 * app-connection QR code shown on their detail page, attached as a PNG.
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

  const contact = await prisma.contact.findUnique({ where: { id: parseInt(id) } });
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!contact.email) return NextResponse.json({ error: "This contact has no email on file" }, { status: 400 });
  if (!contact.token) return NextResponse.json({ error: "This contact has no app access token yet — generate one first" }, { status: 400 });

  const { buffer } = await generateOnboardingQr(contact.token);

  try {
    await sendMail({
      to: contact.email,
      subject: "Welcome to the Farmers Datalab",
      html: messageToHtml(message),
      attachments: [{ filename: "qr-code.png", content: buffer, contentType: "image/png" }],
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  await prisma.contact.update({
    where: { id: contact.id },
    data: { onboarded_at: new Date() },
  });

  return NextResponse.json({ ok: true, sent_to: contact.email });
}
