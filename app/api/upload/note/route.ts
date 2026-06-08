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
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[upload/note]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
