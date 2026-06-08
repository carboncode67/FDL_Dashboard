import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { resolveFarmId, findFieldAndFarmByLocation, findFieldByLocation, firstPointFromGeoJSON } from "@/lib/proximity";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";

export async function POST(request: Request) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { name = null, track_data, start_time = "", end_time = "", ticket_ref = "" } = body;

    const dir = path.join(DATA_DIR, "locations");
    fs.mkdirSync(dir, { recursive: true });

    const trackFilename = `track_${Date.now()}.json`;
    fs.writeFileSync(path.join(dir, trackFilename), JSON.stringify(track_data ?? {}));

    const firstPt = track_data ? firstPointFromGeoJSON(JSON.stringify(track_data)) : null;

    const ptLat = firstPt?.lat ?? null;
    const ptLng = firstPt?.lng ?? null;

    if (auth.kind === "labMember") {
      const { farmId, fieldId } = await findFieldAndFarmByLocation(ptLat ?? 0, ptLng ?? 0);
      await prisma.labMemberUpload.create({
        data: {
          lab_member_id: auth.labMember.id,
          farm_id: farmId,
          field_id: fieldId,
          media_type: "location",
          filename: name ?? null,
          gps_filename: trackFilename,
          latitude: ptLat,
          longitude: ptLng,
          start_time: start_time ? new Date(start_time) : null,
          end_time: end_time ? new Date(end_time) : null,
          date_collected: start_time ? new Date(start_time) : null,
          status: farmId != null ? 2 : 1,
        },
      });
    } else {
      const farmId = await resolveFarmId(auth.contact, ptLat, ptLng);
      const fieldId = ptLat != null && ptLng != null ? await findFieldByLocation(ptLat, ptLng) : null;
      await prisma.location.create({
        data: {
          contact_id: auth.contact.id,
          farm_id: farmId,
          field_id: fieldId,
          name: name ?? null,
          track_filename: trackFilename,
          start_time: start_time ? new Date(start_time) : null,
          end_time: end_time ? new Date(end_time) : null,
          status: 2,
          ticket_ref: ticket_ref || null,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[upload/location]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
