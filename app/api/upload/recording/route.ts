import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { resolveFarmId, findFieldAndFarmByLocation, findFieldByLocation, firstPointFromGeoJSON } from "@/lib/proximity";
import fs from "fs";
import { Readable } from "stream";
import path from "path";
import Busboy from "busboy";

export const runtime = "nodejs";
export const maxDuration = 300;

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";

export async function POST(request: Request) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;

  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }

    if (!request.body) {
      return NextResponse.json({ error: "No request body" }, { status: 400 });
    }

    const dir = path.join(DATA_DIR, "recordings");
    fs.mkdirSync(dir, { recursive: true });

    const { fields, filename } = await new Promise<{
      fields: Record<string, string>;
      filename: string | null;
    }>((resolve, reject) => {
      const bb = Busboy({
        headers: { "content-type": contentType },
        limits: { fieldSize: 10 * 1024 * 1024 }, // 10 MB for gpsTrack field
      });

      const fields: Record<string, string> = {};
      let filename: string | null = null;
      let fileWritePromise: Promise<void> | null = null;

      bb.on("file", (_fieldname, fileStream, info) => {
        filename = `${Date.now()}_${info.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const writeStream = fs.createWriteStream(path.join(dir, filename));
        fileStream.pipe(writeStream);
        fileWritePromise = new Promise<void>((res, rej) => {
          writeStream.on("finish", res);
          writeStream.on("error", rej);
          fileStream.on("error", rej);
        });
      });

      bb.on("field", (name, value) => {
        fields[name] = value;
      });

      bb.on("finish", async () => {
        try {
          if (fileWritePromise) await fileWritePromise;
          resolve({ fields, filename });
        } catch (err) {
          reject(err);
        }
      });

      bb.on("error", reject);

      Readable.fromWeb(
        request.body as Parameters<typeof Readable.fromWeb>[0]
      ).pipe(bb);
    });

    if (!filename) {
      console.error("[upload/recording] 400: no file field in multipart body");
      return NextResponse.json({ error: "No audio file received" }, { status: 400 });
    }

    const stat = fs.statSync(path.join(dir, filename));
    if (stat.size === 0) {
      fs.unlinkSync(path.join(dir, filename));
      console.error("[upload/recording] 400: empty file received:", filename);
      return NextResponse.json({ error: "Empty audio file received" }, { status: 400 });
    }

    const startTime = fields.startTime ?? "";
    const endTime = fields.endTime ?? "";
    const ticket_ref = fields.ticket_ref ?? "";
    const gpsTrack = fields.gpsTrack ?? "";

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
          stage: "Unread",
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
          stage: "Unread",
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[upload/recording]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
