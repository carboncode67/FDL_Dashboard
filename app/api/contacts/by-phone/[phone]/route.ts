import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/contacts/by-phone/{phone}
 *
 * Used by OFEDashBot to resolve a WhatsApp/SMS phone number to a contact's
 * bearer token. Returns the contact if found, 404 if not registered.
 *
 * Matches on the last 10 digits to handle country-code variations
 * (e.g. "6072299837" stored vs "16072299837" received from Twilio).
 *
 * No auth required — this is an internal service endpoint on the private
 * network. Set FDL_SERVICE_TOKEN in OFEDashBot .env if you want to restrict it.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ phone: string }> }
) {
  const { phone } = await params;
  const clean = phone.replace(/\D/g, "");
  if (!clean) return NextResponse.json({ error: "Invalid phone" }, { status: 400 });

  const contacts = await prisma.contact.findMany({
    where: { phone: { not: null } },
    select: {
      id: true,
      name: true,
      phone: true,
      token: true,
      farms_id: true,
      is_lab_member: true,
    },
  });

  const match = contacts.find((c) => {
    const stored = (c.phone ?? "").replace(/\D/g, "");
    return stored.length >= 10 && clean.length >= 10 &&
      stored.slice(-10) === clean.slice(-10);
  });

  if (!match || !match.token) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: match.id,
    name: match.name,
    token: match.token,
    farms_id: match.farms_id,
    is_lab_member: match.is_lab_member,
  });
}
