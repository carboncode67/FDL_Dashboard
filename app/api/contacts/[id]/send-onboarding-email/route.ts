import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit } from "@/lib/roles";
import { generateOnboardingQr } from "@/lib/qr-code";
import { sendMail } from "@/lib/mailer";
import { messageToHtml } from "@/lib/message-to-html";
import crypto from "crypto";

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
  const email = contact.email;

  // Most contacts are bulk-imported (e.g. from NocoDB) with an empty token and
  // never get one until someone opens their detail page and clicks "Generate
  // Token" — which made bulk onboarding-email selection useless in practice
  // (nothing was ever eligible). Provision one here instead of requiring it
  // to already exist.
  let token = contact.token;
  if (!token) {
    token = crypto.randomBytes(32).toString("hex");
    await prisma.contact.update({ where: { id: contact.id }, data: { token } });
  }

  const { buffer } = await generateOnboardingQr(token);

  try {
    await sendMail({
      to: email,
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

  return NextResponse.json({ ok: true, sent_to: email });
}
