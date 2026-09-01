import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { advisoryLock, computeImageHash, findClosestPhotoMatch } from "@/lib/duplicate-detection";
import { buildSuggestedPath } from "@/lib/data-api";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";

// Recordings are streamed via busboy on the mobile route to avoid buffering
// large audio in the Node heap (see CLAUDE.md's upload-route notes). This
// endpoint buffers via formData() instead -- acceptable for a web-submitted
// observation, but capped defensively since there's no streaming here.
const MAX_FILE_BYTES = 15 * 1024 * 1024;

const TYPES = ["photo", "note", "recording", "location"] as const;
type ObservationType = (typeof TYPES)[number];

function isType(t: string): t is ObservationType {
  return (TYPES as readonly string[]).includes(t);
}

/**
 * Mint-once/reuse a Contact for an external caller's own user identity, so
 * repeated submissions from the same farmer land under the same Contact
 * instead of a fresh one each time. See migrations/052_contact_external_ref.sql.
 */
async function resolveContact(
  externalRef: string | null,
  farmerName: string | null,
  farmId: number | null
): Promise<number | null> {
  if (!externalRef) return null;
  const existing = await prisma.contact.findUnique({ where: { external_ref: externalRef } });
  if (existing) return existing.id;
  const created = await prisma.contact.create({
    data: { name: farmerName || "OFE Farmer", external_ref: externalRef, farms_id: farmId, token: "" },
  });
  return created.id;
}

/** Validates a category name applies to this observation type, per its media_types scope. */
async function resolveCategory(name: string | null, type: ObservationType) {
  if (!name) return null;
  const category = await prisma.uploadCategory.findUnique({
    where: { name },
    include: { Metrics: true },
  });
  if (!category) throw new Error(`Unknown category "${name}"`);
  if (category.media_types.length > 0 && !category.media_types.includes(type)) {
    throw new Error(`Category "${name}" does not apply to observation type "${type}"`);
  }
  return category;
}

export async function POST(request: Request) {
  const auth = await authenticateUpload(request);
  if ("error" in auth) return auth.error;

  try {
    const formData = await request.formData();

    const typeRaw = (formData.get("type") as string) ?? "";
    if (!isType(typeRaw)) {
      return NextResponse.json({ error: `type must be one of ${TYPES.join(", ")}` }, { status: 400 });
    }
    const type = typeRaw;

    const farmIdRaw = formData.get("farm_id") as string | null;
    const farmId = farmIdRaw ? Number(farmIdRaw) : NaN;
    if (!Number.isFinite(farmId)) {
      return NextResponse.json({ error: "farm_id is required and must be numeric" }, { status: 400 });
    }
    const farm = await prisma.farm.findUnique({ where: { id: farmId } });
    if (!farm) return NextResponse.json({ error: "Unknown farm_id" }, { status: 400 });

    const projectIdRaw = formData.get("project_id") as string | null;
    const projectId = projectIdRaw ? Number(projectIdRaw) : null;
    const categoryName = (formData.get("category") as string | null) || null;
    const description = (formData.get("description") as string | null) || null;
    const content_hash = (formData.get("content_hash") as string | null) || "";
    const externalRef = (formData.get("external_ref") as string | null) || null;
    const farmerName = (formData.get("farmer_name") as string | null) || null;

    let metricValuesInput: Record<string, unknown> = {};
    const metricValuesRaw = formData.get("metric_values") as string | null;
    if (metricValuesRaw) {
      try { metricValuesInput = JSON.parse(metricValuesRaw); } catch { /* ignore malformed input, treat as none */ }
    }

    if (!content_hash) {
      return NextResponse.json({ error: "content_hash is required" }, { status: 400 });
    }

    let category;
    try {
      category = await resolveCategory(categoryName, type);
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }

    // Only accept metric values for metrics that actually belong to the resolved category.
    const validMetricIds = new Set((category?.Metrics ?? []).map((m) => m.id));
    const metricValues: Record<number, string> = {};
    for (const [k, v] of Object.entries(metricValuesInput)) {
      const metricId = Number(k);
      if (validMetricIds.has(metricId) && v !== null && v !== undefined && String(v) !== "") {
        metricValues[metricId] = String(v);
      }
    }

    const contactId = await resolveContact(externalRef, farmerName, farmId);
    const lockKey = `observations-api:farm:${farmId}`;

    let fileBuffer: Buffer | null = null;
    let phash: string | null = null;
    let filename: string | null = null;
    let trackData: unknown = null;
    let trackFilename: string | null = null;

    if (type === "photo" || type === "recording") {
      const file = formData.get("file") as File | null;
      if (!file || file.size === 0) {
        return NextResponse.json({ error: "file is required for type=" + type }, { status: 400 });
      }
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: `file exceeds ${MAX_FILE_BYTES} byte limit for this endpoint` }, { status: 413 });
      }
      fileBuffer = Buffer.from(await file.arrayBuffer());
      filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      if (type === "photo") {
        try { phash = await computeImageHash(fileBuffer); } catch { phash = null; }
      }
    } else if (type === "location") {
      const trackDataRaw = formData.get("track_data") as string | null;
      if (!trackDataRaw) {
        return NextResponse.json({ error: "track_data is required for type=location" }, { status: 400 });
      }
      try { trackData = JSON.parse(trackDataRaw); } catch {
        return NextResponse.json({ error: "track_data must be valid JSON" }, { status: 400 });
      }
      trackFilename = `track_${Date.now()}.json`;
    }

    const content = (formData.get("content") as string | null) || "";
    if (type === "note" && !content) {
      return NextResponse.json({ error: "content is required for type=note" }, { status: 400 });
    }
    const name = (formData.get("name") as string | null) || null;
    const timestamp = (formData.get("timestamp") as string | null) || "";
    const start_time = (formData.get("start_time") as string | null) || "";
    const end_time = (formData.get("end_time") as string | null) || "";
    const latitudeRaw = formData.get("latitude") as string | null;
    const longitudeRaw = formData.get("longitude") as string | null;
    const latitude = latitudeRaw ? Number(latitudeRaw) : null;
    const longitude = longitudeRaw ? Number(longitudeRaw) : null;

    const result = await prisma.$transaction(async (tx) => {
      await advisoryLock(tx, lockKey);

      // content_hash dedup, same scoping rules as the mobile routes: global
      // for file-bearing types (photo/recording), scoped to the submitting
      // Contact for text/track types (real collision risk there).
      const globalDedup = type === "photo" || type === "recording";
      const dedupWhere = globalDedup
        ? { content_hash }
        : { content_hash, contact_id: contactId };

      switch (type) {
        case "photo": {
          const existing = await tx.photo.findFirst({ where: dedupWhere });
          if (existing) return { duplicate: true as const, table: "photos" as const, id: existing.id };
          break;
        }
        case "note": {
          const existing = await tx.note.findFirst({ where: dedupWhere });
          if (existing) return { duplicate: true as const, table: "notes" as const, id: existing.id };
          break;
        }
        case "recording": {
          const existing = await tx.recording.findFirst({ where: dedupWhere });
          if (existing) return { duplicate: true as const, table: "recordings" as const, id: existing.id };
          break;
        }
        case "location": {
          const existing = await tx.location.findFirst({ where: dedupWhere });
          if (existing) return { duplicate: true as const, table: "locations" as const, id: existing.id };
          break;
        }
      }

      let possibleDuplicateOf: number | null = null;
      if (type === "photo" && phash && contactId != null) {
        const candidates = await tx.photo.findMany({
          where: { contact_id: contactId, phash: { not: null } },
          select: { id: true, phash: true },
        });
        possibleDuplicateOf = findClosestPhotoMatch(candidates, phash);
      }

      const shared = {
        contact_id: contactId,
        farm_id: farmId,
        project_id: projectId,
        category: category?.name ?? null,
        description,
        content_hash,
        stage: "Unread",
      };

      switch (type) {
        case "photo": {
          const created = await tx.photo.create({
            data: {
              ...shared,
              filename: filename ?? "",
              latitude,
              longitude,
              timestamp: timestamp ? new Date(timestamp) : null,
              status: 2,
              phash,
              possible_duplicate_of: possibleDuplicateOf,
            },
          });
          return { duplicate: false as const, table: "photos" as const, id: created.id, row: created };
        }
        case "note": {
          const created = await tx.note.create({
            data: {
              ...shared,
              content,
              latitude,
              longitude,
              timestamp: timestamp ? new Date(timestamp) : null,
              status: 2,
            },
          });
          return { duplicate: false as const, table: "notes" as const, id: created.id, row: created };
        }
        case "recording": {
          const created = await tx.recording.create({
            data: {
              ...shared,
              filename: filename ?? "",
              start_time: start_time ? new Date(start_time) : null,
              end_time: end_time ? new Date(end_time) : null,
              status: 2,
            },
          });
          return { duplicate: false as const, table: "recordings" as const, id: created.id, row: created };
        }
        case "location": {
          const created = await tx.location.create({
            data: {
              ...shared,
              name,
              track_filename: trackFilename,
              start_time: start_time ? new Date(start_time) : null,
              end_time: end_time ? new Date(end_time) : null,
              status: 2,
            },
          });
          return { duplicate: false as const, table: "locations" as const, id: created.id, row: created };
        }
      }
    });

    if (result.duplicate) {
      return NextResponse.json({ ok: true, duplicate: true, table: result.table, id: result.id });
    }

    // Write files to disk only now that we know this isn't a duplicate.
    if (fileBuffer && filename) {
      const dir = path.join(DATA_DIR, type === "photo" ? "photos" : "recordings");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, filename), fileBuffer);
    }
    if (trackFilename) {
      const dir = path.join(DATA_DIR, "locations");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, trackFilename), JSON.stringify(trackData ?? {}));
    }

    if (Object.keys(metricValues).length > 0) {
      await Promise.all(
        Object.entries(metricValues).map(([metricIdStr, value]) =>
          prisma.uploadMetricValue.create({
            data: { upload_table: result.table, upload_id: result.id, metric_id: Number(metricIdStr), value },
          })
        )
      );
    }

    const row = result.row as { filename?: string | null; content?: string | null };
    const resolvedFilename =
      type === "note" ? `note_${result.id}.txt` : row.filename || trackFilename || `${type}_${result.id}`;

    return NextResponse.json(
      {
        ok: true,
        duplicate: false,
        id: result.id,
        table: result.table,
        type,
        filename: resolvedFilename,
        content: type === "note" ? content : null,
        project_id: projectId,
        farm_id: farmId,
        category: category?.name ?? null,
        description,
        status: 2,
        metric_values: metricValues,
        suggested_path: buildSuggestedPath(null, farm.Farm_Name, category?.name ?? null, resolvedFilename),
        download_url: `/api/data/files/${result.table}/${result.id}`,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[data/observations]", err);
    return NextResponse.json({ error: "Failed to create observation" }, { status: 500 });
  }
}
