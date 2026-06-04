import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { resolveFarmId } from "@/lib/proximity";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;

  // Contact cards only come from WhatsApp farmers, not lab members
  if (auth.kind === "labMember") {
    return NextResponse.json({ error: "Not supported for lab members" }, { status: 400 });
  }

  try {
    const { name, phone, email, org, note } = await request.json();
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const farmId = await resolveFarmId(auth.contact, null, null);
    await prisma.whatsAppContactCard.create({
      data: {
        contact_id: auth.contact.id,
        farm_id: farmId,
        shared_name: name,
        shared_phone: phone ?? null,
        shared_email: email ?? null,
        shared_org: org ?? null,
        note: note ?? null,
        status: 2,
        ticket_ref: ticket_ref || null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[upload/contact-card]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
