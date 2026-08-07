import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { resolveFarmId, findFieldAndFarmByLocation, findFieldByLocation } from "@/lib/proximity";
import { advisoryLock, computeImageHash, findClosestPhotoMatch } from "@/lib/duplicate-detection";
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
    const content_hash = (formData.get("content_hash") as string) ?? "";

    let geo: { latitude?: number; longitude?: number } = {};
    try { geo = JSON.parse(geoJSON); } catch (_) {}

    const lat = geo.latitude ?? null;
    const lng = geo.longitude ?? null;

    // Read file bytes and compute a perceptual hash up front (pure CPU work,
    // kept outside the transaction below to keep the advisory lock hold short).
    const fileBuffer = file && file.size > 0 ? Buffer.from(await file.arrayBuffer()) : null;
    const depthBuffer = depthFile && depthFile.size > 0 ? Buffer.from(await depthFile.arrayBuffer()) : null;
    let phash: string | null = null;
    if (fileBuffer) {
      try { phash = await computeImageHash(fileBuffer); } catch (_) { phash = null; }
    }

    // Resolve farm/field before the transaction -- pure reads, not part of the
    // dedup check-then-insert race the transaction below closes.
    let farmId: number | null;
    let fieldId: number | null;
    if (auth.kind === "labMember") {
      const resolved = await findFieldAndFarmByLocation(lat ?? 0, lng ?? 0);
      farmId = resolved.farmId;
      fieldId = resolved.fieldId;
    } else {
      farmId = await resolveFarmId(auth.contact, lat, lng);
      fieldId = lat != null && lng != null ? await findFieldByLocation(lat, lng) : null;
    }

    const lockKey = auth.kind === "labMember" ? `labMember:${auth.labMember.id}` : `contact:${auth.contact.id}`;

    const result = await prisma.$transaction(async (tx) => {
      // Serializes concurrent uploads from this submitter, closing the
      // findFirst-then-create race on both checks below.
      await advisoryLock(tx, lockKey);

      // Deduplicate by content_hash first (global -- identical file bytes across
      // submitters is effectively impossible, and this also survives a device
      // re-onboarding with a new token). Lab member uploads land in
      // Lab_Member_Uploads, not Photos, so they must be checked separately.
      if (content_hash) {
        if (auth.kind === "labMember") {
          const existing = await tx.labMemberUpload.findFirst({ where: { content_hash, media_type: "photo" } });
          if (existing) return { duplicate: true as const, id: existing.id };
        } else {
          const existing = await tx.photo.findFirst({ where: { content_hash } });
          if (existing) return { duplicate: true as const, id: existing.id };
        }
      }

      // Deduplicate by ticket_ref (prevents duplicate records when Twilio fires a webhook twice)
      if (auth.kind === "contact" && ticket_ref) {
        const existing = await tx.photo.findFirst({ where: { ticket_ref } });
        if (existing) return { duplicate: true as const, id: existing.id };
      }

      // Possible-duplicate heuristic: same submitter, visually near-identical
      // image (pHash Hamming distance). Flagged for review, never auto-rejected.
      let possibleDuplicateOf: number | null = null;
      if (phash) {
        if (auth.kind === "labMember") {
          const candidates = await tx.labMemberUpload.findMany({
            where: { lab_member_id: auth.labMember.id, media_type: "photo", phash: { not: null } },
            select: { id: true, phash: true },
          });
          possibleDuplicateOf = findClosestPhotoMatch(candidates, phash);
        } else {
          const candidates = await tx.photo.findMany({
            where: { contact_id: auth.contact.id, phash: { not: null } },
            select: { id: true, phash: true },
          });
          possibleDuplicateOf = findClosestPhotoMatch(candidates, phash);
        }
      }

      if (auth.kind === "labMember") {
        const created = await tx.labMemberUpload.create({
          data: {
            lab_member_id: auth.labMember.id,
            farm_id: farmId,
            field_id: fieldId,
            media_type: "photo",
            filename: file ? `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}` : null,
            depth_filename: depthFile ? `${Date.now()}_${depthFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}` : null,
            latitude: lat,
            longitude: lng,
            content: note || null,
            date_collected: timestamp ? new Date(timestamp) : null,
            status: farmId != null ? 2 : 1,
            content_hash: content_hash || null,
            phash,
            possible_duplicate_of: possibleDuplicateOf,
            stage: "Unread",
          },
        });
        return { duplicate: false as const, created };
      }

      const created = await tx.photo.create({
        data: {
          contact_id: auth.contact.id,
          farm_id: farmId,
          field_id: fieldId,
          filename: file ? `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}` : "",
          depth_filename: depthFile ? `${Date.now()}_${depthFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}` : null,
          latitude: lat,
          longitude: lng,
          note: note || null,
          timestamp: timestamp ? new Date(timestamp) : null,
          status: 2,
          ticket_ref: ticket_ref || null,
          content_hash: content_hash || null,
          phash,
          possible_duplicate_of: possibleDuplicateOf,
          stage: "Unread",
        },
      });
      return { duplicate: false as const, created };
    });

    if (result.duplicate) {
      return NextResponse.json({ ok: true, duplicate: true, id: result.id });
    }

    // Write files to disk only now that we know this isn't a duplicate,
    // using the same filenames stamped on the row inside the transaction.
    if (fileBuffer && result.created.filename) {
      const dir = path.join(DATA_DIR, "photos");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, result.created.filename), fileBuffer);
    }
    if (depthBuffer && result.created.depth_filename) {
      const dir = path.join(DATA_DIR, "depth_maps");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, result.created.depth_filename), depthBuffer);
    }

    return NextResponse.json({ ok: true, possible_duplicate: result.created.possible_duplicate_of != null });
  } catch (err) {
    console.error("[upload/photo]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
