import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { resolveFarmId, resolveFarmIdForLabMember } from "@/lib/proximity";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";

export async function POST(request: Request) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const geoJSON = (formData.get("geoJSON") as string) ?? "{}";
    const note = (formData.get("note") as string) ?? "";
    const ticket_ref = (formData.get("ticket_ref") as string) ?? "";
    const timestamp = (formData.get("timestamp") as string) ?? "";

    let geo: { latitude?: number; longitude?: number } = {};
    try { geo = JSON.parse(geoJSON); } catch (_) {}

    let filename = "";
    if (file && file.size > 0) {
      const dir = path.join(DATA_DIR, "videos");
      fs.mkdirSync(dir, { recursive: true });
      filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      fs.writeFileSync(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
    }

    const lat = geo.latitude ?? null;
    const lng = geo.longitude ?? null;

    if (auth.kind === "labMember") {
      const farmId = await resolveFarmIdForLabMember(lat, lng);
      await prisma.labMemberUpload.create({
        data: {
          lab_member_id: auth.labMember.id,
          farm_id: farmId,
          media_type: "video",
          filename: filename || null,
          latitude: lat,
          longitude: lng,
          content: note || null,
          date_collected: timestamp ? new Date(timestamp) : null,
          status: farmId != null ? 2 : 1,
        },
      });
    } else {
      const farmId = await resolveFarmId(auth.contact, lat, lng);
      await prisma.video.create({
        data: {
          contact_id: auth.contact.id,
          farm_id: farmId,
          filename,
          latitude: lat,
          longitude: lng,
          note: note || null,
          timestamp: timestamp ? new Date(timestamp) : null,
          status: 2,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[upload/video]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
