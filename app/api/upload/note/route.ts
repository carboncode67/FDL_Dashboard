import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { resolveFarmId, findFieldAndFarmByLocation, findFieldByLocation } from "@/lib/proximity";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { content = "", latitude = null, longitude = null, timestamp = "", ticket_ref = "" } = body;

    // Deduplicate: ticket_ref exact match, or identical content from same contact within 1 hour
    if (auth.kind === "contact") {
      if (ticket_ref) {
        const existing = await prisma.note.findFirst({ where: { ticket_ref } });
        if (existing) return NextResponse.json({ ok: true, duplicate: true, id: existing.id });
      } else if (content) {
        const cutoff = new Date(Date.now() - 60 * 60 * 1000);
        const existing = await prisma.note.findFirst({
          where: { contact_id: auth.contact.id, content, received_at: { gte: cutoff } },
        });
        if (existing) return NextResponse.json({ ok: true, duplicate: true, id: existing.id });
      }
    }

    if (auth.kind === "labMember") {
      const { farmId, fieldId } = await findFieldAndFarmByLocation(latitude ?? 0, longitude ?? 0);
      await prisma.labMemberUpload.create({
        data: {
          lab_member_id: auth.labMember.id,
          farm_id: farmId,
          field_id: fieldId,
          media_type: "note",
          content: content || null,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          date_collected: timestamp ? new Date(timestamp) : null,
          status: farmId != null ? 2 : 1,
          stage: "Unread",
        },
      });
    } else {
      const farmId = await resolveFarmId(auth.contact, latitude, longitude);
      const fieldId = latitude != null && longitude != null ? await findFieldByLocation(latitude, longitude) : null;
      await prisma.note.create({
        data: {
          contact_id: auth.contact.id,
          farm_id: farmId,
          field_id: fieldId,
          content,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          timestamp: timestamp ? new Date(timestamp) : null,
          status: 2,
          ticket_ref: ticket_ref || null,
          stage: "Unread",
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[upload/note]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
