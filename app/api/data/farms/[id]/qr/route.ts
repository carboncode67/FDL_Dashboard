import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { generateOnboardingQr } from "@/lib/qr-code";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const farmId = parseInt(id);
  if (isNaN(farmId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const farm = await prisma.farm.findUnique({
    where: { id: farmId },
    select: {
      Farm_Name: true,
      // Fetch every contact with a real token, not just non-lab-member ones — is_lab_member
      // is a legacy/parallel flag (used for GPS-based upload resolution) that can be set on a
      // genuine farmer contact, which would otherwise hide a perfectly valid onboarding token.
      Contacts: { where: { token: { not: "" } }, select: { name: true, token: true, is_lab_member: true } },
    },
  });

  if (!farm) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Prefer a non-lab-member contact, but fall back to any contact with a token so a
  // mismarked is_lab_member flag can't silently block a farm's onboarding QR code.
  const contact = farm.Contacts.find((c) => !c.is_lab_member) ?? farm.Contacts[0];
  if (!contact) {
    return NextResponse.json({ error: "No onboarding contact/token for this farm" }, { status: 404 });
  }

  const { dataUrl } = await generateOnboardingQr(contact.token);
  return NextResponse.json({ dataUrl, contactName: contact.name });
}
