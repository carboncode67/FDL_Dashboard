import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;
  if (auth.kind !== "labMember")
    return NextResponse.json({ error: "Lab member token required" }, { status: 403 });

  try {
    const body = await request.json();
    const { content = "", farmer_name = "", latitude = null, longitude = null, timestamp = "", ticket_ref = "" } = body;

    await prisma.labMemberUpload.create({
      data: {
        lab_member_id: auth.labMember.id,
        media_type: "note",
        content: content || null,
        farmer_name: farmer_name || null,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        date_collected: timestamp ? new Date(timestamp) : null,
        ticket_ref: ticket_ref || null,
        status: 1,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[lab-member-upload/note]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
