import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { runWithLab } from "@/lib/lab-db";

// GET /api/data/contacts/by-email?email=... — bearer-token authed, used by
// OFE_Dashboard's self-service farmer signup (a farmer's email is checked
// against this, the real farmer directory, before OFE lets them set an
// OFE-only password). Deliberately NOT added to lib/route-scopes.ts's
// RESTRICTED_ALLOWED_ROUTES — Contact PII should stay unreachable to a
// restricted (mobile/QR) token; only OFE's unrestricted service-account
// token can call this.
//
// Returns only what OFE needs to create its own local records: id, name,
// email, farms_id. Never phone/token/other Contact fields. 404s (not a
// distinguishable "no match" vs "found but ineligible" response) both when
// there's truly no match and when the match is a lab member or has no
// farms_id — OFE's own forgot-password route already collapses every
// outcome into one generic message, so this route doesn't need to
// distinguish either.
export async function GET(req: Request) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;
  return runWithLab(auth.labSlug, async () => {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email")?.trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });

    const contact = await prisma.contact.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, is_lab_member: false, farms_id: { not: null } },
      select: { id: true, name: true, email: true, farms_id: true },
    });
    if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(contact);
  });
}
