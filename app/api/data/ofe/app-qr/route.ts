import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withOfeService } from "@/lib/ofe-sync";
import { generateOnboardingQr } from "@/lib/qr-code";

// GET /api/data/ofe/app-qr?email=... — the mobile-app login QR for the
// person with this email, so an OFE user can sign their phone in from OFE's
// home page. Resolves the email the same way OFE assignments do
// (lib/ofe-sync.ts): lab-member User first, else farmer Contact. Service-only:
// the QR carries that person's bearer token, and OFE only ever asks for its
// own signed-in user's email.
export async function GET(req: Request) {
  return withOfeService(req, async ({ labId }) => {
    const email = new URL(req.url).searchParams.get("email")?.trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });
    const labFilter = labId != null ? { lab_id: labId } : {};

    // public.users has no RLS, so the lab filter is the only thing stopping a
    // match against another lab's member.
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, is_service_account: false, ...labFilter },
      select: { name: true, bearer_token: true },
    });
    const contact = user
      ? null
      : await prisma.contact.findFirst({
          where: { email: { equals: email, mode: "insensitive" }, token: { not: "" }, ...labFilter },
          select: { name: true, token: true },
        });
    const token = user ? user.bearer_token : contact?.token;
    if (!token) return NextResponse.json({ error: "No phone login for this email" }, { status: 404 });

    const { dataUrl } = await generateOnboardingQr(token);
    return NextResponse.json(
      { dataUrl, name: user?.name ?? contact?.name ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
