import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { resolveFarmId, firstPointFromGeoJSON } from "@/lib/proximity";
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
    const startTime = (formData.get("startTime") as string) ?? "";
    const endTime = (formData.get("endTime") as string) ?? "";
    const gpsTrack = (formData.get("gpsTrack") as string) ?? "";

    const dir = path.join(DATA_DIR, "recordings");
    fs.mkdirSync(dir, { recursive: true });

    let filename = "";
    if (file && file.size > 0) {
      filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      fs.writeFileSync(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
    }

    let gpsFilename: string | null = null;
    if (gpsTrack) {
      gpsFilename = `gps_${Date.now()}.json`;
      fs.writeFileSync(path.join(dir, gpsFilename), gpsTrack);
    }

    const firstPt = gpsTrack ? firstPointFromGeoJSON(gpsTrack) : null;
    const farmId = await resolveFarmId(auth.contact, firstPt?.lat ?? null, firstPt?.lng ?? null);

    await prisma.recording.create({
      data: {
        contact_id: auth.contact.id,
        farm_id: farmId,
        filename,
        gps_filename: gpsFilename,
        start_time: startTime ? new Date(startTime) : null,
        end_time: endTime ? new Date(endTime) : null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[upload/recording]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
