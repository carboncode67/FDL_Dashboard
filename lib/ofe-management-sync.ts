import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { UploadTable } from "@/lib/data-api";
import { OfeSyncError, type OfeService } from "@/lib/ofe-sync";

// OFE Dashboard -> FDB one-way sync of farmer management events (migration
// 096; plan: docs/context-update-and-farm-timeline-plan.md §6). Same shape as
// lib/ofe-sync.ts's forms/maps: OFE owns each row and pushes a whole snapshot
// keyed by ofe_id; rows with ofe_id set are read-only in this dashboard (no
// web edit routes exist for them). OFE_Dashboard's src/lib/fdl-management-sync.ts
// is the only caller.
//
// References OFE sends (experiment, fields, uploads) are checked against the
// event's farm. A bad or not-yet-synced one is dropped and reported back
// rather than failing the push, so one stale link can't wedge an event; OFE's
// snapshot hash includes the resolved ids, so it re-pushes once they resolve.

// ---------------------------------------------------------------------------
// Operation catalog
// ---------------------------------------------------------------------------

export interface OfeOperationCatalogInput {
  categories: { ofe_id: number; name: string; sort_order: number }[];
  types: {
    ofe_id: number;
    category_ofe_id: number;
    name: string;
    requires_implement: boolean;
    requires_seed_or_product: boolean;
    sort_order: number;
  }[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isPosInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

export function validateOperationCatalogInput(body: unknown): OfeOperationCatalogInput | string {
  if (!isObj(body) || !Array.isArray(body.categories) || !Array.isArray(body.types)) {
    return "Expected { categories: [...], types: [...] }";
  }
  const categories: OfeOperationCatalogInput["categories"] = [];
  for (const c of body.categories) {
    if (!isObj(c) || !isPosInt(c.ofe_id) || !str(c.name)) return "Each category needs ofe_id and name";
    categories.push({ ofe_id: c.ofe_id, name: String(c.name), sort_order: Number(c.sort_order) || 0 });
  }
  const types: OfeOperationCatalogInput["types"] = [];
  for (const t of body.types) {
    if (!isObj(t) || !isPosInt(t.ofe_id) || !isPosInt(t.category_ofe_id) || !str(t.name)) {
      return "Each type needs ofe_id, category_ofe_id and name";
    }
    types.push({
      ofe_id: t.ofe_id,
      category_ofe_id: t.category_ofe_id,
      name: String(t.name),
      requires_implement: t.requires_implement !== false,
      requires_seed_or_product: t.requires_seed_or_product !== false,
      sort_order: Number(t.sort_order) || 0,
    });
  }
  return { categories, types };
}

/**
 * Upserts the catalog in place (by lab + ofe_id). A category/type OFE no
 * longer has is deleted unless management events still reference it — then
 * it is kept so those events keep their label.
 */
export async function upsertOfeOperationCatalog(input: OfeOperationCatalogInput, service: OfeService) {
  const labId = service.labId;
  const categoryIds = new Map<number, number>();
  for (const c of input.categories) {
    const existing = await prisma.operationCategory.findFirst({ where: { lab_id: labId, ofe_id: c.ofe_id }, select: { id: true } });
    const data = { name: c.name, sort_order: c.sort_order };
    const row = existing
      ? await prisma.operationCategory.update({ where: { id: existing.id }, data, select: { id: true } })
      : await prisma.operationCategory.create({ data: { ...data, ofe_id: c.ofe_id, lab_id: labId }, select: { id: true } });
    categoryIds.set(c.ofe_id, row.id);
  }

  for (const t of input.types) {
    const categoryId = categoryIds.get(t.category_ofe_id);
    if (categoryId == null) throw new OfeSyncError(`type ${t.ofe_id} references unknown category ${t.category_ofe_id}`, 400);
    const existing = await prisma.operationType.findFirst({ where: { lab_id: labId, ofe_id: t.ofe_id }, select: { id: true } });
    const data = {
      category_id: categoryId,
      name: t.name,
      requires_implement: t.requires_implement,
      requires_seed_or_product: t.requires_seed_or_product,
      sort_order: t.sort_order,
    };
    if (existing) await prisma.operationType.update({ where: { id: existing.id }, data });
    else await prisma.operationType.create({ data: { ...data, ofe_id: t.ofe_id, lab_id: labId } });
  }

  const typeOfeIds = input.types.map((t) => t.ofe_id);
  const removedTypes = await prisma.operationType.deleteMany({
    where: { lab_id: labId, ofe_id: { not: null, notIn: typeOfeIds }, Events: { none: {} } },
  });
  const removedCategories = await prisma.operationCategory.deleteMany({
    where: { lab_id: labId, ofe_id: { not: null, notIn: input.categories.map((c) => c.ofe_id) }, Types: { none: {} } },
  });
  return { categories: input.categories.length, types: input.types.length, removed: removedTypes.count + removedCategories.count };
}

// ---------------------------------------------------------------------------
// Management events
// ---------------------------------------------------------------------------

const UPLOAD_TABLES: UploadTable[] = ["photos", "notes", "recordings", "locations", "videos", "lab-member-uploads"];

export interface OfeManagementEventInput {
  fdl_farm_id: number;
  operation_type_ofe_id: number;
  event_date: string; // YYYY-MM-DD
  fdl_experiment_id: number | null;
  fdl_field_ids: number[];
  uploads: { table: UploadTable; id: number }[];
  notes: string | null;
  source: string;
  implement: Record<string, unknown> | null;
  product: Record<string, unknown> | null;
  crop_variety: Record<string, unknown> | null;
  created_by_email: string | null;
  created_by_name: string | null;
  entered_on_behalf_of_email: string | null;
  ofe_created_at: string | null;
  ofe_updated_at: string | null;
  snapshot_hash: string | null;
}

const SOURCES = new Set(["farmer_web", "lab_member_web", "api_sync"]);

export function validateManagementEventInput(body: unknown): OfeManagementEventInput | string {
  if (!isObj(body)) return "Invalid JSON";
  if (!isPosInt(body.fdl_farm_id)) return "fdl_farm_id required";
  if (!isPosInt(body.operation_type_ofe_id)) return "operation_type_ofe_id required";
  if (typeof body.event_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.event_date)) return "event_date must be YYYY-MM-DD";
  const fieldIds = Array.isArray(body.fdl_field_ids) ? body.fdl_field_ids.filter(isPosInt) : [];
  const uploads = Array.isArray(body.uploads)
    ? body.uploads.filter(
        (u): u is { table: UploadTable; id: number } =>
          isObj(u) && UPLOAD_TABLES.includes(u.table as UploadTable) && isPosInt(u.id),
      )
    : [];
  const snap = (v: unknown) => (isObj(v) ? v : null);
  const date = (v: unknown) => (typeof v === "string" && !isNaN(Date.parse(v)) ? v : null);
  return {
    fdl_farm_id: body.fdl_farm_id,
    operation_type_ofe_id: body.operation_type_ofe_id,
    event_date: body.event_date,
    fdl_experiment_id: isPosInt(body.fdl_experiment_id) ? body.fdl_experiment_id : null,
    fdl_field_ids: [...new Set(fieldIds)],
    uploads,
    notes: typeof body.notes === "string" ? body.notes : null,
    source: typeof body.source === "string" && SOURCES.has(body.source) ? body.source : "farmer_web",
    implement: snap(body.implement),
    product: snap(body.product),
    crop_variety: snap(body.crop_variety),
    created_by_email: str(body.created_by_email),
    created_by_name: str(body.created_by_name),
    entered_on_behalf_of_email: str(body.entered_on_behalf_of_email),
    ofe_created_at: date(body.ofe_created_at),
    ofe_updated_at: date(body.ofe_updated_at),
    snapshot_hash: str(body.snapshot_hash),
  };
}

/** Upload ids among `ids` that exist in `table` on `farmId`. */
async function uploadIdsOnFarm(table: UploadTable, ids: number[], farmId: number): Promise<Set<number>> {
  const where = { id: { in: ids }, farm_id: farmId };
  const select = { id: true } as const;
  let rows: { id: number }[];
  switch (table) {
    case "photos": rows = await prisma.photo.findMany({ where, select }); break;
    case "notes": rows = await prisma.note.findMany({ where, select }); break;
    case "recordings": rows = await prisma.recording.findMany({ where, select }); break;
    case "locations": rows = await prisma.location.findMany({ where, select }); break;
    case "videos": rows = await prisma.video.findMany({ where, select }); break;
    case "lab-member-uploads": rows = await prisma.labMemberUpload.findMany({ where, select }); break;
  }
  return new Set(rows.map((r) => r.id));
}

// A snapshot, or SQL NULL when OFE sent none (so a removed product clears).
const json = (v: Record<string, unknown> | null) => (v ? (v as Prisma.InputJsonValue) : Prisma.DbNull);

export async function upsertOfeManagementEvent(ofeId: number, input: OfeManagementEventInput, service: OfeService) {
  const farm = await prisma.farm.findUnique({ where: { id: input.fdl_farm_id }, select: { id: true } });
  if (!farm) throw new OfeSyncError("fdl_farm_id not found", 400);

  const opType = await prisma.operationType.findFirst({
    where: { lab_id: service.labId, ofe_id: input.operation_type_ofe_id },
    select: { id: true },
  });
  // OFE pushes the catalog before events; a 409 makes it retry next cycle.
  if (!opType) throw new OfeSyncError("operation type has not been synced yet", 409);

  const dropped: string[] = [];

  let experimentId: number | null = null;
  if (input.fdl_experiment_id != null) {
    const exp = await prisma.farmExperiment.findFirst({
      where: { id: input.fdl_experiment_id, farm_id: farm.id },
      select: { id: true },
    });
    if (exp) experimentId = exp.id;
    else dropped.push(`experiment ${input.fdl_experiment_id}`);
  }

  const fields = input.fdl_field_ids.length
    ? await prisma.field.findMany({ where: { id: { in: input.fdl_field_ids }, Farms_id: farm.id }, select: { id: true } })
    : [];
  const fieldIds = new Set(fields.map((f) => f.id));
  for (const id of input.fdl_field_ids) if (!fieldIds.has(id)) dropped.push(`field ${id}`);

  const uploads: { upload_table: string; upload_id: number }[] = [];
  for (const table of UPLOAD_TABLES) {
    const ids = input.uploads.filter((u) => u.table === table).map((u) => u.id);
    if (!ids.length) continue;
    const ok = await uploadIdsOnFarm(table, ids, farm.id);
    for (const id of ids) {
      if (ok.has(id)) uploads.push({ upload_table: table, upload_id: id });
      else dropped.push(`${table} ${id}`);
    }
  }

  const data = {
    farm_id: farm.id,
    operation_type_id: opType.id,
    event_date: new Date(`${input.event_date}T00:00:00Z`),
    experiment_id: experimentId,
    notes: input.notes,
    source: input.source,
    implement: json(input.implement),
    product: json(input.product),
    crop_variety: json(input.crop_variety),
    created_by_email: input.created_by_email,
    created_by_name: input.created_by_name,
    entered_on_behalf_of_email: input.entered_on_behalf_of_email,
    ofe_created_at: input.ofe_created_at ? new Date(input.ofe_created_at) : null,
    ofe_updated_at: input.ofe_updated_at ? new Date(input.ofe_updated_at) : null,
    snapshot_hash: input.snapshot_hash,
    synced_at: new Date(),
  };
  const event = await prisma.managementEvent.upsert({
    where: { ofe_id: ofeId },
    create: { ...data, ofe_id: ofeId },
    update: data,
    select: { id: true },
  });

  // Links: replace wholesale — both sets are tiny.
  await prisma.managementEventField.deleteMany({ where: { event_id: event.id } });
  if (fieldIds.size) {
    await prisma.managementEventField.createMany({
      data: [...fieldIds].map((field_id) => ({ event_id: event.id, field_id })),
      skipDuplicates: true,
    });
  }
  await prisma.managementEventUpload.deleteMany({ where: { event_id: event.id } });
  if (uploads.length) {
    await prisma.managementEventUpload.createMany({
      data: uploads.map((u) => ({ ...u, event_id: event.id })),
      skipDuplicates: true,
    });
  }

  return { id: event.id, dropped };
}

/** OFE-owned events, optionally for one farm — for OFE's delete reconciliation. */
export async function listOfeManagementEvents(farmId: number | null) {
  return prisma.managementEvent.findMany({
    where: { ofe_id: { not: null }, ...(farmId != null ? { farm_id: farmId } : {}) },
    select: { id: true, ofe_id: true, farm_id: true, snapshot_hash: true },
    orderBy: { id: "asc" },
  });
}
