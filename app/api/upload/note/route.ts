import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { resolveFarmId } from "@/lib/proximity";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { content = "", latitude = null, longitude = null, timestamp = "" } = body;

    const farmId = await resolveFarmId(auth.contact, latitude, longitude);

    await prisma.note.create({
      data: {
        contact_id: auth.contact.id,
        farm_id: farmId,
        content,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        timestamp: timestamp ? new Date(timestamp) : null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[upload/note]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
