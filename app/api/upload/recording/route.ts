import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { resolveFarmId, findFieldAndFarmByLocation, findFieldByLocation, firstPointFromGeoJSON } from "@/lib/proximity";
import { advisoryLock, findClosestRecordingMatch, RECORDING_TIME_WINDOW_MIN } from "@/lib/duplicate-detection";
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
    const content_hash = fields.contentHash ?? "";

    let gpsFilename: string | null = null;
    if (gpsTrack) {
      gpsFilename = `gps_${Date.now()}.json`;
      fs.writeFileSync(path.join(dir, gpsFilename), gpsTrack);
    }

    const firstPt = gpsTrack ? firstPointFromGeoJSON(gpsTrack) : null;
    const ptLat = firstPt?.lat ?? null;
    const ptLng = firstPt?.lng ?? null;
    const startDate = startTime ? new Date(startTime) : null;
    const endDate = endTime ? new Date(endTime) : null;

    // Resolve farm/field before the transaction -- pure reads, not part of the
    // dedup check-then-insert race the transaction below closes.
    let farmId: number | null;
    let fieldId: number | null;
    if (auth.kind === "labMember") {
      const resolved = await findFieldAndFarmByLocation(ptLat ?? 0, ptLng ?? 0);
      farmId = resolved.farmId;
      fieldId = resolved.fieldId;
    } else {
      farmId = await resolveFarmId(auth.contact, ptLat, ptLng);
      fieldId = ptLat != null && ptLng != null ? await findFieldByLocation(ptLat, ptLng) : null;
    }

    const lockKey = auth.kind === "labMember" ? `labMember:${auth.labMember.id}` : `contact:${auth.contact.id}`;

    const result = await prisma.$transaction(async (tx) => {
      // Serializes concurrent uploads from this submitter, closing the
      // findFirst-then-create race on both checks below.
      await advisoryLock(tx, lockKey);

      // Deduplicate by content_hash first (global, client-supplied -- see photo route).
      // Lab member uploads land in Lab_Member_Uploads, not Recordings, so they
      // must be checked separately.
      if (content_hash) {
        const existing = auth.kind === "labMember"
          ? await tx.labMemberUpload.findFirst({ where: { content_hash, media_type: "recording" } })
          : await tx.recording.findFirst({ where: { content_hash } });
        if (existing) return { duplicate: true as const, id: existing.id };
      }

      // Deduplicate by ticket_ref.
      if (auth.kind === "contact" && ticket_ref) {
        const existing = await tx.recording.findFirst({ where: { ticket_ref } });
        if (existing) return { duplicate: true as const, id: existing.id };
      }

      // Possible-duplicate heuristic: same submitter, close duration + timestamp
      // + start position. Flagged for review, never auto-rejected.
      let possibleDuplicateOf: number | null = null;
      if (startDate && endDate && ptLat != null && ptLng != null) {
        const windowStart = new Date(startDate.getTime() - RECORDING_TIME_WINDOW_MIN * 60_000);
        const windowEnd = new Date(startDate.getTime() + RECORDING_TIME_WINDOW_MIN * 60_000);

        if (auth.kind === "labMember") {
          const candidates = await tx.labMemberUpload.findMany({
            where: {
              lab_member_id: auth.labMember.id,
              media_type: "recording",
              start_time: { gte: windowStart, lte: windowEnd },
            },
            select: { id: true, start_time: true, end_time: true, latitude: true, longitude: true },
          });
          possibleDuplicateOf = findClosestRecordingMatch(
            candidates.map((c) => ({ id: c.id, startTime: c.start_time, endTime: c.end_time, lat: c.latitude, lng: c.longitude })),
            { startTime: startDate, endTime: endDate, lat: ptLat, lng: ptLng }
          );
        } else {
          const candidates = await tx.recording.findMany({
            where: { contact_id: auth.contact.id, start_time: { gte: windowStart, lte: windowEnd } },
            select: { id: true, start_time: true, end_time: true, start_latitude: true, start_longitude: true },
          });
          possibleDuplicateOf = findClosestRecordingMatch(
            candidates.map((c) => ({ id: c.id, startTime: c.start_time, endTime: c.end_time, lat: c.start_latitude, lng: c.start_longitude })),
            { startTime: startDate, endTime: endDate, lat: ptLat, lng: ptLng }
          );
        }
      }

      if (auth.kind === "labMember") {
        const created = await tx.labMemberUpload.create({
          data: {
            lab_member_id: auth.labMember.id,
            farm_id: farmId,
            field_id: fieldId,
            media_type: "recording",
            filename,
            gps_filename: gpsFilename,
            latitude: ptLat,
            longitude: ptLng,
            start_time: startDate,
            end_time: endDate,
            date_collected: startDate,
            status: farmId != null ? 2 : 1,
            content_hash: content_hash || null,
            possible_duplicate_of: possibleDuplicateOf,
            stage: "Unread",
          },
        });
        return { duplicate: false as const, created };
      }

      const created = await tx.recording.create({
        data: {
          contact_id: auth.contact.id,
          farm_id: farmId,
          field_id: fieldId,
          filename,
          gps_filename: gpsFilename,
          start_time: startDate,
          end_time: endDate,
          start_latitude: ptLat,
          start_longitude: ptLng,
          status: 2,
          ticket_ref: ticket_ref || null,
          content_hash: content_hash || null,
          possible_duplicate_of: possibleDuplicateOf,
          stage: "Unread",
        },
      });
      return { duplicate: false as const, created };
    });

    if (result.duplicate) {
      // File already written to disk — clean up since a duplicate was found.
      try { fs.unlinkSync(path.join(dir, filename)); } catch (_) {}
      if (gpsFilename) { try { fs.unlinkSync(path.join(dir, gpsFilename)); } catch (_) {} }
      return NextResponse.json({ ok: true, duplicate: true, id: result.id });
    }

    return NextResponse.json({ ok: true, possible_duplicate: result.created.possible_duplicate_of != null });
  } catch (err) {
    console.error("[upload/recording]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
