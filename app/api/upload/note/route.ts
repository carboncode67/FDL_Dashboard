import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { resolveFarmId, findFieldAndFarmByLocation, findFieldByLocation } from "@/lib/proximity";
import { advisoryLock } from "@/lib/duplicate-detection";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { content = "", latitude = null, longitude = null, timestamp = "", ticket_ref = "", content_hash = "" } = body;

    // Resolve farm/field before the transaction -- pure reads, not part of the
    // dedup check-then-insert race the transaction below closes.
    let farmId: number | null;
    let fieldId: number | null;
    if (auth.kind === "labMember") {
      const resolved = await findFieldAndFarmByLocation(latitude ?? 0, longitude ?? 0);
      farmId = resolved.farmId;
      fieldId = resolved.fieldId;
    } else {
      farmId = await resolveFarmId(auth.contact, latitude, longitude);
      fieldId = latitude != null && longitude != null ? await findFieldByLocation(latitude, longitude) : null;
    }

    const lockKey = auth.kind === "labMember" ? `labMember:${auth.labMember.id}` : `contact:${auth.contact.id}`;

    const result = await prisma.$transaction(async (tx) => {
      // Serializes concurrent uploads from this submitter, closing the
      // findFirst-then-create race on the checks below.
      await advisoryLock(tx, lockKey);

      // Deduplicate by content_hash first, scoped to the same submitter -- unlike
      // photos/recordings, short note text has real collision risk across
      // different contacts/lab-members, so don't dedup globally here.
      if (content_hash) {
        if (auth.kind === "contact") {
          const existing = await tx.note.findFirst({ where: { content_hash, contact_id: auth.contact.id } });
          if (existing) return { duplicate: true as const, id: existing.id };
        } else {
          const existing = await tx.labMemberUpload.findFirst({
            where: { content_hash, lab_member_id: auth.labMember.id, media_type: "note" },
          });
          if (existing) return { duplicate: true as const, id: existing.id };
        }
      }

      // Deduplicate: ticket_ref exact match, or identical content from same contact within 1 hour
      if (auth.kind === "contact") {
        if (ticket_ref) {
          const existing = await tx.note.findFirst({ where: { ticket_ref } });
          if (existing) return { duplicate: true as const, id: existing.id };
        } else if (content) {
          const cutoff = new Date(Date.now() - 60 * 60 * 1000);
          const existing = await tx.note.findFirst({
            where: { contact_id: auth.contact.id, content, received_at: { gte: cutoff } },
          });
          if (existing) return { duplicate: true as const, id: existing.id };
        }
      }

      if (auth.kind === "labMember") {
        await tx.labMemberUpload.create({
          data: {
            lab_member_id: auth.labMember.id,
            farm_id: farmId,
            field_id: fieldId,
            media_type: "note",
            content: content || null,
            latitude: latitude ?? null,
            longitude: longitude ?? null,
            date_collected: timestamp ? new Date(timestamp) : null,
            status: farmId != null ? 2 : 1,
            content_hash: content_hash || null,
            stage: "Unread",
          },
        });
      } else {
        await tx.note.create({
          data: {
            contact_id: auth.contact.id,
            farm_id: farmId,
            field_id: fieldId,
            content,
            latitude: latitude ?? null,
            longitude: longitude ?? null,
            timestamp: timestamp ? new Date(timestamp) : null,
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

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[upload/note]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
