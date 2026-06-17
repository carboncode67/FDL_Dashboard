import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";

export async function PATCH(request: Request) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { ticket_refs, latitude, longitude } = body;

    if (!ticket_refs?.length || latitude == null || longitude == null) {
      return NextResponse.json({ error: "ticket_refs, latitude, longitude required" }, { status: 400 });
    }

    // Update photos and videos directly
    await Promise.all([
      prisma.photo.updateMany({
        where: { ticket_ref: { in: ticket_refs } },
        data: { latitude, longitude },
      }),
      prisma.video.updateMany({
        where: { ticket_ref: { in: ticket_refs } },
        data: { latitude, longitude },
      }),
    ]);

    // For recordings, write a GPS file and link it
    const recordings = await prisma.recording.findMany({
      where: { ticket_ref: { in: ticket_refs } },
    });

    for (const rec of recordings) {
      const dir = path.join(DATA_DIR, "recordings");
      fs.mkdirSync(dir, { recursive: true });
      const gpsFilename = `gps_${Date.now()}_${rec.id}.json`;
      const gpsData = {
        type: "Feature",
        geometry: { type: "LineString", coordinates: [[longitude, latitude]] },
      };
      fs.writeFileSync(path.join(dir, gpsFilename), JSON.stringify(gpsData));
      await prisma.recording.update({
        where: { id: rec.id },
        data: { gps_filename: gpsFilename },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[upload/geotag]", err);
    return NextResponse.json({ error: "Geotag failed" }, { status: 500 });
  }
}
