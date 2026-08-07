import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { resolveFarmId, findFieldAndFarmByLocation, findFieldByLocation, firstPointFromGeoJSON } from "@/lib/proximity";
import { advisoryLock } from "@/lib/duplicate-detection";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";

export async function POST(request: Request) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { name = null, track_data, start_time = "", end_time = "", ticket_ref = "", content_hash = "" } = body;

    const trackFilename = `track_${Date.now()}.json`;
    const firstPt = track_data ? firstPointFromGeoJSON(JSON.stringify(track_data)) : null;
    const ptLat = firstPt?.lat ?? null;
    const ptLng = firstPt?.lng ?? null;

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
      // findFirst-then-create race on the checks below.
      await advisoryLock(tx, lockKey);

      // Deduplicate by content_hash first, scoped to the same submitter (same
      // reasoning as notes -- GPS tracks are more collision-prone across
      // different submitters than photo/audio bytes).
      if (content_hash) {
        if (auth.kind === "contact") {
          const existing = await tx.location.findFirst({ where: { content_hash, contact_id: auth.contact.id } });
          if (existing) return { duplicate: true as const, id: existing.id };
        } else {
          const existing = await tx.labMemberUpload.findFirst({
            where: { content_hash, lab_member_id: auth.labMember.id, media_type: "location" },
          });
          if (existing) return { duplicate: true as const, id: existing.id };
        }
      }

      // Deduplicate by ticket_ref
      if (auth.kind === "contact" && ticket_ref) {
        const existing = await tx.location.findFirst({ where: { ticket_ref } });
        if (existing) return { duplicate: true as const, id: existing.id };
      }

      if (auth.kind === "labMember") {
        await tx.labMemberUpload.create({
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
            content_hash: content_hash || null,
            stage: "Unread",
          },
        });
      } else {
        await tx.location.create({
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
            content_hash: content_hash || null,
            stage: "Unread",
          },
        });
      }
      return { duplicate: false as const };
    });

    if (result.duplicate) {
      return NextResponse.json({ ok: true, duplicate: true, id: result.id });
    }

    // Write the track file to disk only now that we know this isn't a duplicate.
    const dir = path.join(DATA_DIR, "locations");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, trackFilename), JSON.stringify(track_data ?? {}));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[upload/location]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
