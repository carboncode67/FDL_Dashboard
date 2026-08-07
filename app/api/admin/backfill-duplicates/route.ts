import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { firstPointFromGeoJSON } from "@/lib/proximity";
import { computeImageHash, findClosestPhotoMatch, findClosestRecordingMatch, RECORDING_TIME_WINDOW_MIN } from "@/lib/duplicate-detection";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 300;

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";

// One-time (re-runnable) sweep that computes phash/position for existing
// uploads that predate this feature, then runs the same possible-duplicate
// flagging the upload routes apply to new uploads. Safe to re-run -- only
// touches rows still missing phash/start_latitude or possible_duplicate_of.
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const summary = {
    photos_hashed: 0,
    photos_flagged: 0,
    lab_photos_hashed: 0,
    lab_photos_flagged: 0,
    recordings_positioned: 0,
    recordings_flagged: 0,
    lab_recordings_flagged: 0,
    errors: [] as string[],
  };

  // --- Photos: compute missing phash ---
  const photosNeedingHash = await prisma.photo.findMany({
    where: { phash: null, filename: { not: "" } },
    select: { id: true, filename: true },
  });
  for (const p of photosNeedingHash) {
    try {
      const buffer = fs.readFileSync(path.join(DATA_DIR, "photos", p.filename));
      const phash = await computeImageHash(buffer);
      await prisma.photo.update({ where: { id: p.id }, data: { phash } });
      summary.photos_hashed++;
    } catch (err) {
      summary.errors.push(`photo ${p.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const labPhotosNeedingHash = await prisma.labMemberUpload.findMany({
    where: { media_type: "photo", phash: null, filename: { not: null } },
    select: { id: true, filename: true },
  });
  for (const p of labPhotosNeedingHash) {
    try {
      const buffer = fs.readFileSync(path.join(DATA_DIR, "photos", p.filename!));
      const phash = await computeImageHash(buffer);
      await prisma.labMemberUpload.update({ where: { id: p.id }, data: { phash } });
      summary.lab_photos_hashed++;
    } catch (err) {
      summary.errors.push(`lab-member-upload ${p.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // --- Photos: flag possible duplicates (same contact/lab-member, only
  // compare against earlier-uploaded rows to avoid mutual/circular flags) ---
  const unflaggedPhotos = await prisma.photo.findMany({
    where: { possible_duplicate_of: null, phash: { not: null } },
    select: { id: true, phash: true, contact_id: true },
  });
  for (const p of unflaggedPhotos) {
    if (!p.contact_id || !p.phash) continue;
    const candidates = await prisma.photo.findMany({
      where: { contact_id: p.contact_id, id: { lt: p.id }, phash: { not: null } },
      select: { id: true, phash: true },
    });
    const match = findClosestPhotoMatch(candidates, p.phash);
    if (match) {
      await prisma.photo.update({ where: { id: p.id }, data: { possible_duplicate_of: match } });
      summary.photos_flagged++;
    }
  }

  const unflaggedLabPhotos = await prisma.labMemberUpload.findMany({
    where: { media_type: "photo", possible_duplicate_of: null, phash: { not: null } },
    select: { id: true, phash: true, lab_member_id: true },
  });
  for (const p of unflaggedLabPhotos) {
    if (!p.lab_member_id || !p.phash) continue;
    const candidates = await prisma.labMemberUpload.findMany({
      where: { media_type: "photo", lab_member_id: p.lab_member_id, id: { lt: p.id }, phash: { not: null } },
      select: { id: true, phash: true },
    });
    const match = findClosestPhotoMatch(candidates, p.phash);
    if (match) {
      await prisma.labMemberUpload.update({ where: { id: p.id }, data: { possible_duplicate_of: match } });
      summary.lab_photos_flagged++;
    }
  }

  // --- Recordings: backfill start_latitude/start_longitude from the GPS track file ---
  const recordingsNeedingPosition = await prisma.recording.findMany({
    where: { start_latitude: null, gps_filename: { not: null } },
    select: { id: true, gps_filename: true },
  });
  for (const r of recordingsNeedingPosition) {
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, "recordings", r.gps_filename!), "utf-8");
      const pt = firstPointFromGeoJSON(raw);
      if (pt) {
        await prisma.recording.update({
          where: { id: r.id },
          data: { start_latitude: pt.lat, start_longitude: pt.lng },
        });
        summary.recordings_positioned++;
      }
    } catch (err) {
      summary.errors.push(`recording ${r.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // --- Recordings: flag possible duplicates (same contact, only compare
  // against earlier-uploaded rows) ---
  const unflaggedRecordings = await prisma.recording.findMany({
    where: { possible_duplicate_of: null, start_time: { not: null }, end_time: { not: null }, start_latitude: { not: null } },
    select: { id: true, contact_id: true, start_time: true, end_time: true, start_latitude: true, start_longitude: true },
  });
  for (const r of unflaggedRecordings) {
    if (!r.contact_id || !r.start_time) continue;
    const windowStart = new Date(r.start_time.getTime() - RECORDING_TIME_WINDOW_MIN * 60_000);
    const windowEnd = new Date(r.start_time.getTime() + RECORDING_TIME_WINDOW_MIN * 60_000);
    const candidates = await prisma.recording.findMany({
      where: { contact_id: r.contact_id, id: { lt: r.id }, start_time: { gte: windowStart, lte: windowEnd } },
      select: { id: true, start_time: true, end_time: true, start_latitude: true, start_longitude: true },
    });
    const match = findClosestRecordingMatch(
      candidates.map((c) => ({ id: c.id, startTime: c.start_time, endTime: c.end_time, lat: c.start_latitude, lng: c.start_longitude })),
      { startTime: r.start_time, endTime: r.end_time, lat: r.start_latitude, lng: r.start_longitude }
    );
    if (match) {
      await prisma.recording.update({ where: { id: r.id }, data: { possible_duplicate_of: match } });
      summary.recordings_flagged++;
    }
  }

  const unflaggedLabRecordings = await prisma.labMemberUpload.findMany({
    where: {
      media_type: "recording",
      possible_duplicate_of: null,
      start_time: { not: null },
      end_time: { not: null },
      latitude: { not: null },
    },
    select: { id: true, lab_member_id: true, start_time: true, end_time: true, latitude: true, longitude: true },
  });
  for (const r of unflaggedLabRecordings) {
    if (!r.lab_member_id || !r.start_time) continue;
    const windowStart = new Date(r.start_time.getTime() - RECORDING_TIME_WINDOW_MIN * 60_000);
    const windowEnd = new Date(r.start_time.getTime() + RECORDING_TIME_WINDOW_MIN * 60_000);
    const candidates = await prisma.labMemberUpload.findMany({
      where: {
        media_type: "recording",
        lab_member_id: r.lab_member_id,
        id: { lt: r.id },
        start_time: { gte: windowStart, lte: windowEnd },
      },
      select: { id: true, start_time: true, end_time: true, latitude: true, longitude: true },
    });
    const match = findClosestRecordingMatch(
      candidates.map((c) => ({ id: c.id, startTime: c.start_time, endTime: c.end_time, lat: c.latitude, lng: c.longitude })),
      { startTime: r.start_time, endTime: r.end_time, lat: r.latitude, lng: r.longitude }
    );
    if (match) {
      await prisma.labMemberUpload.update({ where: { id: r.id }, data: { possible_duplicate_of: match } });
      summary.lab_recordings_flagged++;
    }
  }

  return NextResponse.json(summary);
}
