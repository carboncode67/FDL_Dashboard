import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { resolveFarmId, findFieldAndFarmByLocation, findFieldByLocation } from "@/lib/proximity";
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
    const depthFile = (formData.get("depthFile") ?? formData.get("depth_map")) as File | null;
    const geoJSON = (formData.get("geoJSON") as string) ?? "{}";
    const ticket_ref = (formData.get("ticket_ref") as string) ?? "";
    const note = (formData.get("note") as string) ?? "";
    const timestamp = (formData.get("timestamp") as string) ?? "";

    let geo: { latitude?: number; longitude?: number } = {};
    try { geo = JSON.parse(geoJSON); } catch (_) {}

    // Deduplicate by ticket_ref (prevents duplicate records when Twilio fires a webhook twice)
    if (auth.kind === "contact" && ticket_ref) {
      const existing = await prisma.photo.findFirst({ where: { ticket_ref } });
      if (existing) return NextResponse.json({ ok: true, duplicate: true, id: existing.id });
    }

    let filename = "";
    if (file && file.size > 0) {
      const dir = path.join(DATA_DIR, "photos");
      fs.mkdirSync(dir, { recursive: true });
      filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      fs.writeFileSync(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
    }

    let depth_filename: string | null = null;
    if (depthFile && depthFile.size > 0) {
      const dir = path.join(DATA_DIR, "depth_maps");
      fs.mkdirSync(dir, { recursive: true });
      depth_filename = `${Date.now()}_${depthFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      fs.writeFileSync(path.join(dir, depth_filename), Buffer.from(await depthFile.arrayBuffer()));
    }

    const lat = geo.latitude ?? null;
    const lng = geo.longitude ?? null;

    if (auth.kind === "labMember") {
      const { farmId, fieldId } = await findFieldAndFarmByLocation(lat ?? 0, lng ?? 0);
      await prisma.labMemberUpload.create({
        data: {
          lab_member_id: auth.labMember.id,
          farm_id: farmId,
          field_id: fieldId,
          media_type: "photo",
          filename: filename || null,
          depth_filename,
          latitude: lat,
          longitude: lng,
          content: note || null,
          date_collected: timestamp ? new Date(timestamp) : null,
          status: farmId != null ? 2 : 1,
          stage: "Unread",
        },
      });
    } else {
      const farmId = await resolveFarmId(auth.contact, lat, lng);
      const fieldId = lat != null && lng != null ? await findFieldByLocation(lat, lng) : null;
      await prisma.photo.create({
        data: {
          contact_id: auth.contact.id,
          farm_id: farmId,
          field_id: fieldId,
          filename,
          depth_filename,
          latitude: lat,
          longitude: lng,
          note: note || null,
          timestamp: timestamp ? new Date(timestamp) : null,
          status: 2,
          ticket_ref: ticket_ref || null,
          stage: "Unread",
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[upload/photo]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
