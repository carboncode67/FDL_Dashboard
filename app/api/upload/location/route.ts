import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { resolveFarmId, resolveFarmIdForLabMember, firstPointFromGeoJSON } from "@/lib/proximity";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";

export async function POST(request: Request) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { name = null, track_data, start_time = "", end_time = "" } = body;

    const dir = path.join(DATA_DIR, "locations");
    fs.mkdirSync(dir, { recursive: true });

    const trackFilename = `track_${Date.now()}.json`;
    fs.writeFileSync(path.join(dir, trackFilename), JSON.stringify(track_data ?? {}));

    const firstPt = track_data ? firstPointFromGeoJSON(JSON.stringify(track_data)) : null;

    if (auth.kind === "labMember") {
      const farmId = await resolveFarmIdForLabMember(firstPt?.lat ?? null, firstPt?.lng ?? null);
      await prisma.labMemberUpload.create({
        data: {
          lab_member_id: auth.labMember.id,
          farm_id: farmId,
          media_type: "location",
          filename: name ?? null,
          gps_filename: trackFilename,
          latitude: firstPt?.lat ?? null,
          longitude: firstPt?.lng ?? null,
          start_time: start_time ? new Date(start_time) : null,
          end_time: end_time ? new Date(end_time) : null,
          date_collected: start_time ? new Date(start_time) : null,
          status: farmId != null ? 2 : 1,
        },
      });
    } else {
      const farmId = await resolveFarmId(auth.contact, firstPt?.lat ?? null, firstPt?.lng ?? null);
      await prisma.location.create({
        data: {
          contact_id: auth.contact.id,
          farm_id: farmId,
          name: name ?? null,
          track_filename: trackFilename,
          start_time: start_time ? new Date(start_time) : null,
          end_time: end_time ? new Date(end_time) : null,
          status: 2,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[upload/location]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
