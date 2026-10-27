import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { runWithLab } from "@/lib/lab-db";
import { sendMail } from "@/lib/mailer";

// POST /api/data/contacts/[id]/send-ofe-invite — bearer-token authed, same
// unrestricted-only reasoning as by-email/route.ts. Body is deliberately
// just { reset_url } — never arbitrary subject/HTML from the caller, so this
// can't become an open email-relay if the token were ever compromised. The
// email copy lives here, not on the OFE side, matching how
// app/api/contacts/[id]/send-onboarding-email/route.ts already owns its own
// copy for the FarmerDataLogger onboarding email.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;
  return runWithLab(auth.labSlug, async () => {
    const { id } = await params;
    const contactId = parseInt(id);
    if (isNaN(contactId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { reset_url?: string } | null;
    if (!body?.reset_url || typeof body.reset_url !== "string") {
      return NextResponse.json({ error: "reset_url is required" }, { status: 400 });
    }

    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!contact.email) return NextResponse.json({ error: "This contact has no email on file" }, { status: 400 });

    try {
      await sendMail({
        to: contact.email,
        subject: "Set up your OFE Dashboard account",
        html: `
          <p>Hi ${contact.name},</p>
          <p>Someone requested access to the OFE Dashboard for your farm using this email address.</p>
          <p><a href="${body.reset_url}">Click here to set your password</a>. This link expires in 1 hour.</p>
          <p>If you didn't request this, you can ignore this email — no account will be created.</p>
        `,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  });
}
