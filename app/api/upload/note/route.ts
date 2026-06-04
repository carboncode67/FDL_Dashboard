import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { resolveFarmId, resolveFarmIdForLabMember } from "@/lib/proximity";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { content = "", latitude = null, longitude = null, timestamp = "" } = body;

    if (auth.kind === "labMember") {
      const farmId = await resolveFarmIdForLabMember(latitude, longitude);
      await prisma.labMemberUpload.create({
        data: {
          lab_member_id: auth.labMember.id,
          farm_id: farmId,
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
      await prisma.note.create({
        data: {
          contact_id: auth.contact.id,
          farm_id: farmId,
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
