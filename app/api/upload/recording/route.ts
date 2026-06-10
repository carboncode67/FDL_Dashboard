import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { resolveFarmId, findFieldAndFarmByLocation, findFieldByLocation, firstPointFromGeoJSON } from "@/lib/proximity";
import fs from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 300;

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";

export async function POST(request: Request) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const startTime = (formData.get("startTime") as string) ?? "";
    const endTime = (formData.get("endTime") as string) ?? "";
    const ticket_ref = (formData.get("ticket_ref") as string) ?? "";
    const gpsTrack = (formData.get("gpsTrack") as string) ?? "";

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No audio file received" }, { status: 400 });
    }

    const dir = path.join(DATA_DIR, "recordings");
    fs.mkdirSync(dir, { recursive: true });

    const filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await pipeline(
      Readable.fromWeb(file.stream() as Parameters<typeof Readable.fromWeb>[0]),
      fs.createWriteStream(path.join(dir, filename))
    );

    let gpsFilename: string | null = null;
    if (gpsTrack) {
      gpsFilename = `gps_${Date.now()}.json`;
      fs.writeFileSync(path.join(dir, gpsFilename), gpsTrack);
    }

    const firstPt = gpsTrack ? firstPointFromGeoJSON(gpsTrack) : null;
    const ptLat = firstPt?.lat ?? null;
    const ptLng = firstPt?.lng ?? null;

    if (auth.kind === "labMember") {
      const { farmId, fieldId } = await findFieldAndFarmByLocation(ptLat ?? 0, ptLng ?? 0);
      await prisma.labMemberUpload.create({
        data: {
          lab_member_id: auth.labMember.id,
          farm_id: farmId,
          field_id: fieldId,
          media_type: "recording",
          filename,
          gps_filename: gpsFilename,
          latitude: ptLat,
          longitude: ptLng,
          start_time: startTime ? new Date(startTime) : null,
          end_time: endTime ? new Date(endTime) : null,
          date_collected: startTime ? new Date(startTime) : null,
          status: farmId != null ? 2 : 1,
        },
      });
    } else {
      const farmId = await resolveFarmId(auth.contact, ptLat, ptLng);
      const fieldId = ptLat != null && ptLng != null ? await findFieldByLocation(ptLat, ptLng) : null;
      await prisma.recording.create({
        data: {
          contact_id: auth.contact.id,
          farm_id: farmId,
          field_id: fieldId,
          filename,
          gps_filename: gpsFilename,
          start_time: startTime ? new Date(startTime) : null,
          end_time: endTime ? new Date(endTime) : null,
          status: 2,
          ticket_ref: ticket_ref || null,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[upload/recording]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
