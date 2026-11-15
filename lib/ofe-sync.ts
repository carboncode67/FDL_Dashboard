import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { runWithLab } from "@/lib/lab-db";

// OFE Dashboard -> FDB one-way sync of Custom Forms and Sampling Maps
// (migration 091). OFE farmers build and assign maps in OFE, but the mobile
// apps only ever read this database, so OFE pushes each form/map here as a
// whole snapshot and this module upserts it in place, keyed by ofe_id. Rows
// with ofe_id set are OFE-owned: read-only in this dashboard (see
// ofeOwnedResponse below, used by the web edit routes) and listed in their
// own section. OFE_Dashboard's src/lib/fdl-sync.ts is the only caller.
//
// Identity: OFE has its own users, so an assignment arrives as an email. It
// resolves to a lab-member User, else a farmer Contact, else (consultants
// share the farmer's phone login for now) a farm-level assignment on the
// farms OFE says that person works on. Each assignment's outcome is reported
// back so OFE can show "on phone" / "via farm login" / "no phone account".
//
// No $transaction (nothing else here uses one under runWithLab): every step
// is an idempotent upsert/delete, so a push that fails midway is repaired by
// OFE's next push of the same snapshot.

export interface OfeService {
  userId: string;
  labId: number | null;
}

/** 403s anything but an unrestricted service-account token, independent of BEARER_SCOPE_ENFORCEMENT. */
export async function withOfeService(
  req: Request,
  fn: (service: OfeService) => Promise<NextResponse>,
): Promise<NextResponse> {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;
  if (auth.kind !== "labMember" || auth.restricted) {
    return NextResponse.json({ error: "Forbidden — service token required" }, { status: 403 });
  }
  const service = { userId: auth.labMember.id, labId: auth.labMember.lab_id };
  return runWithLab(auth.labSlug, () => fn(service));
}

/** For the session-authed web edit routes: refuse changes to an OFE-owned row. */
export function ofeOwnedResponse(kind: "form" | "sampling map"): NextResponse {
  return NextResponse.json(
    { error: `This ${kind} was created in the OFE Dashboard and can only be edited there.` },
    { status: 409 },
  );
}

export function parseOfeId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export interface OfeAssignmentInput {
  ofe_id: number;
  // Exactly one target kind:
  email?: string | null;
  fdl_farm_id?: number | null;
  fdl_experiment_id?: number | null;
  // For an email that matches no User/Contact: farms to fall back to.
  fallback_fdl_farm_ids?: number[];
}

export type OfeAssignmentResolution = "user" | "contact" | "farm" | "experiment" | "farm_fallback" | "unresolved";

export interface OfeAssignmentResult {
  ofe_id: number;
  resolved: OfeAssignmentResolution;
}

type AssignmentRow = {
  user_id?: string;
  contact_id?: number;
  farm_id?: number;
  farm_experiment_id?: number;
};

async function resolveAssignments(
  inputs: OfeAssignmentInput[],
  labId: number | null,
): Promise<{ rows: AssignmentRow[]; results: OfeAssignmentResult[] }> {
  const rows: AssignmentRow[] = [];
  const results: OfeAssignmentResult[] = [];
  const seen = new Set<string>();
  const push = (row: AssignmentRow) => {
    const key = JSON.stringify(row);
    if (!seen.has(key)) {
      seen.add(key);
      rows.push(row);
    }
  };

  for (const a of inputs) {
    if (a.fdl_farm_id != null) {
      const farm = await prisma.farm.findUnique({ where: { id: a.fdl_farm_id }, select: { id: true } });
      if (farm) push({ farm_id: farm.id });
      results.push({ ofe_id: a.ofe_id, resolved: farm ? "farm" : "unresolved" });
      continue;
    }
    if (a.fdl_experiment_id != null) {
      const exp = await prisma.farmExperiment.findUnique({ where: { id: a.fdl_experiment_id }, select: { id: true } });
      if (exp) push({ farm_experiment_id: exp.id });
      results.push({ ofe_id: a.ofe_id, resolved: exp ? "experiment" : "unresolved" });
      continue;
    }
    const email = a.email?.trim();
    if (!email) {
      results.push({ ofe_id: a.ofe_id, resolved: "unresolved" });
      continue;
    }
    const user = await prisma.user.findFirst({
      // public.users has no RLS, so the lab filter here is the only thing
      // stopping a match against another lab's member.
      where: { email: { equals: email, mode: "insensitive" }, is_service_account: false, ...(labId != null ? { lab_id: labId } : {}) },
      select: { id: true },
    });
    if (user) {
      push({ user_id: user.id });
      results.push({ ofe_id: a.ofe_id, resolved: "user" });
      continue;
    }
    const contact = await prisma.contact.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, ...(labId != null ? { lab_id: labId } : {}) },
      select: { id: true },
    });
    if (contact) {
      push({ contact_id: contact.id });
      results.push({ ofe_id: a.ofe_id, resolved: "contact" });
      continue;
    }
    const fallbackIds = [...new Set(a.fallback_fdl_farm_ids ?? [])];
    const farms = fallbackIds.length
      ? await prisma.farm.findMany({ where: { id: { in: fallbackIds } }, select: { id: true } })
      : [];
    for (const f of farms) push({ farm_id: f.id });
    results.push({ ofe_id: a.ofe_id, resolved: farms.length ? "farm_fallback" : "unresolved" });
  }
  return { rows, results };
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export interface OfeFormFieldInput {
  field_key: string;
  col_index: number;
  field_type: string;
  label: string;
  required: boolean;
  options: string[] | null;
  show_when_label: string | null;
  show_when_value: string | null;
  archived_at: string | null;
  previous_labels: string[];
}

export interface OfeFormInput {
  title: string;
  description: string | null;
  is_active: boolean;
  fields: OfeFormFieldInput[];
  assignments: OfeAssignmentInput[];
}

const FIELD_TYPES = new Set(["text", "number", "boolean", "date", "select", "multiselect", "photo"]);

export function validateFormInput(body: unknown): OfeFormInput | string {
  const b = body as Partial<OfeFormInput> | null;
  if (!b || typeof b !== "object") return "Invalid JSON";
  if (typeof b.title !== "string" || !b.title.trim()) return "title is required";
  if (!Array.isArray(b.fields) || !Array.isArray(b.assignments)) return "fields and assignments are required";
  const keys = new Set<string>();
  for (const f of b.fields) {
    if (typeof f?.field_key !== "string" || !f.field_key) return "every field needs a field_key";
    if (keys.has(f.field_key)) return `duplicate field_key ${f.field_key}`;
    keys.add(f.field_key);
    if (!FIELD_TYPES.has(f.field_type)) return `unknown field_type ${f.field_type}`;
    if (typeof f.label !== "string") return "every field needs a label";
  }
  return b as OfeFormInput;
}

export async function upsertOfeForm(ofeId: number, input: OfeFormInput, service: OfeService) {
  const data = {
    title: input.title,
    description: input.description,
    is_active: input.is_active,
  };
  const form = await prisma.form.upsert({
    where: { ofe_id: ofeId },
    create: { ...data, ofe_id: ofeId, created_by_id: service.userId },
    update: data,
    select: { id: true },
  });

  // field_key is copied verbatim from OFE, so it identifies the same field
  // on both sides and Form_Responses.data needs no translation.
  for (const f of input.fields) {
    const fieldData = {
      col_index: f.col_index,
      field_type: f.field_type,
      label: f.label,
      required: f.required,
      options:
        (f.field_type === "select" || f.field_type === "multiselect") && f.options
          ? (f.options as Prisma.InputJsonValue)
          : Prisma.DbNull,
      show_when_label: f.show_when_label,
      show_when_value: f.show_when_value,
      archived_at: f.archived_at ? new Date(f.archived_at) : null,
      previous_labels: f.previous_labels ?? [],
    };
    await prisma.formFieldDefinition.upsert({
      where: { form_id_field_key: { form_id: form.id, field_key: f.field_key } },
      create: { ...fieldData, form_id: form.id, field_key: f.field_key },
      update: fieldData,
    });
  }
  // OFE archives (never deletes) a field that holds answers, so a key missing
  // from the snapshot was deleted there with no answers -- safe to drop here.
  await prisma.formFieldDefinition.deleteMany({
    where: { form_id: form.id, field_key: { notIn: input.fields.map((f) => f.field_key) } },
  });

  const { rows, results } = await resolveAssignments(input.assignments, service.labId);
  await prisma.formAssignment.deleteMany({ where: { form_id: form.id } });
  if (rows.length) {
    await prisma.formAssignment.createMany({ data: rows.map((r) => ({ ...r, form_id: form.id })) });
  }

  return { id: form.id, assignments: results };
}

// ---------------------------------------------------------------------------
// Sampling maps
// ---------------------------------------------------------------------------

export interface OfeSamplingMapInput {
  fdl_farm_id: number;
  fdl_experiment_id: number | null;
  name: string;
  description: string | null;
  ofe_form_id: number | null;
  proximity_radius_m: number | null;
  polygons: { ofe_id: number; label: string | null; purpose: string; geometry: string; source: string }[];
  points: {
    ofe_id: number;
    // Set when OFE pulled this point back from a phone (placement_method
    // "field") and is now giving it an ofe_id.
    fdl_id: number | null;
    ofe_polygon_id: number | null;
    label: string | null;
    geometry: string;
    placement_method: string;
    sample_index: number | null;
  }[];
  assignments: OfeAssignmentInput[];
}

export function validateSamplingMapInput(body: unknown): OfeSamplingMapInput | string {
  const b = body as Partial<OfeSamplingMapInput> | null;
  if (!b || typeof b !== "object") return "Invalid JSON";
  if (!Number.isInteger(b.fdl_farm_id)) return "fdl_farm_id is required";
  if (typeof b.name !== "string" || !b.name.trim()) return "name is required";
  if (!Array.isArray(b.polygons) || !Array.isArray(b.points) || !Array.isArray(b.assignments)) {
    return "polygons, points and assignments are required";
  }
  for (const p of [...b.polygons, ...b.points]) {
    if (!Number.isInteger(p?.ofe_id)) return "every polygon/point needs an ofe_id";
    if (typeof p.geometry !== "string") return "every polygon/point needs a geometry";
  }
  return b as OfeSamplingMapInput;
}

export class OfeSyncError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function upsertOfeSamplingMap(ofeId: number, input: OfeSamplingMapInput, service: OfeService) {
  const farm = await prisma.farm.findUnique({ where: { id: input.fdl_farm_id }, select: { id: true } });
  if (!farm) throw new OfeSyncError("fdl_farm_id not found", 400);

  let formId: number | null = null;
  if (input.ofe_form_id != null) {
    const form = await prisma.form.findUnique({ where: { ofe_id: input.ofe_form_id }, select: { id: true } });
    // OFE pushes forms before maps; a 409 makes it retry next cycle rather
    // than silently dropping the link.
    if (!form) throw new OfeSyncError("linked form has not been synced yet", 409);
    formId = form.id;
  }

  let experimentId: number | null = null;
  if (input.fdl_experiment_id != null) {
    const exp = await prisma.farmExperiment.findUnique({ where: { id: input.fdl_experiment_id }, select: { id: true } });
    experimentId = exp?.id ?? null;
  }

  const data = {
    farm_id: farm.id,
    experiment_id: experimentId,
    name: input.name,
    description: input.description,
    form_id: formId,
    proximity_radius_m: input.proximity_radius_m,
  };
  const map = await prisma.samplingMap.upsert({
    where: { ofe_id: ofeId },
    create: { ...data, ofe_id: ofeId, created_by_id: service.userId },
    update: data,
    select: { id: true },
  });

  const polygonIds = new Map<number, number>();
  for (const p of input.polygons) {
    const polyData = { label: p.label, purpose: p.purpose, geometry: p.geometry, source: p.source };
    const row = await prisma.samplingMapPolygon.upsert({
      where: { sampling_map_id_ofe_id: { sampling_map_id: map.id, ofe_id: p.ofe_id } },
      create: { ...polyData, sampling_map_id: map.id, ofe_id: p.ofe_id },
      update: polyData,
      select: { id: true },
    });
    polygonIds.set(p.ofe_id, row.id);
  }
  await prisma.samplingMapPolygon.deleteMany({
    where: { sampling_map_id: map.id, ofe_id: { notIn: input.polygons.map((p) => p.ofe_id) } },
  });

  const pointIds: { ofe_id: number; id: number }[] = [];
  for (const p of input.points) {
    const pointData = {
      polygon_id: p.ofe_polygon_id != null ? (polygonIds.get(p.ofe_polygon_id) ?? null) : null,
      label: p.label,
      geometry: p.geometry,
      placement_method: p.placement_method,
      sample_index: p.sample_index,
    };
    // A phone-created point OFE has since pulled back: claim it by FDB id so
    // its responses/collections stay attached.
    if (p.fdl_id != null) {
      const claimed = await prisma.samplingPoint.updateMany({
        where: { id: p.fdl_id, sampling_map_id: map.id, OR: [{ ofe_id: null }, { ofe_id: p.ofe_id }] },
        data: { ...pointData, ofe_id: p.ofe_id },
      });
      if (claimed.count > 0) {
        pointIds.push({ ofe_id: p.ofe_id, id: p.fdl_id });
        continue;
      }
    }
    const row = await prisma.samplingPoint.upsert({
      where: { sampling_map_id_ofe_id: { sampling_map_id: map.id, ofe_id: p.ofe_id } },
      create: { ...pointData, sampling_map_id: map.id, ofe_id: p.ofe_id },
      update: pointData,
      select: { id: true },
    });
    pointIds.push({ ofe_id: p.ofe_id, id: row.id });
  }
  // Only OFE-known points are removable; ofe_id NULL ones were created on a
  // phone and haven't been pulled into OFE yet.
  await prisma.samplingPoint.deleteMany({
    where: {
      sampling_map_id: map.id,
      ofe_id: { not: null, notIn: input.points.map((p) => p.ofe_id) },
    },
  });

  const { rows, results } = await resolveAssignments(input.assignments, service.labId);
  await prisma.samplingMapAssignment.deleteMany({ where: { sampling_map_id: map.id } });
  if (rows.length) {
    await prisma.samplingMapAssignment.createMany({ data: rows.map((r) => ({ ...r, sampling_map_id: map.id })) });
  }

  return { id: map.id, points: pointIds, assignments: results };
}

// ---------------------------------------------------------------------------
// Responses (FDB -> OFE)
// ---------------------------------------------------------------------------

/**
 * Phone submissions to an OFE-owned form, oldest first, after `afterId`
 * (OFE's cursor). Each carries the submitter's email (for OFE to match its own
 * user) and its sampling point -- by ofe_id, or, for a point created on the
 * phone, the FDB point itself so OFE can create it.
 */
export async function listOfeFormResponses(ofeFormId: number, afterId: number, limit: number) {
  const form = await prisma.form.findUnique({ where: { ofe_id: ofeFormId }, select: { id: true } });
  if (!form) return null;
  const responses = await prisma.formResponse.findMany({
    where: { form_id: form.id, id: { gt: afterId } },
    orderBy: { id: "asc" },
    take: limit,
    include: {
      Contact: { select: { name: true, email: true } },
      User: { select: { name: true, email: true } },
      SamplingPoint: {
        select: {
          id: true,
          ofe_id: true,
          label: true,
          geometry: true,
          placement_method: true,
          SamplingMap: { select: { ofe_id: true } },
        },
      },
    },
  });
  return responses.map((r) => ({
    id: r.id,
    data: r.data,
    submitted_at: r.submitted_at,
    older_form_version: r.older_form_version,
    missing_required: r.missing_required,
    lat: r.lat,
    lng: r.lng,
    fdl_farm_id: r.farm_id,
    submitted_by: {
      name: r.User?.name ?? r.Contact?.name ?? null,
      email: r.User?.email ?? r.Contact?.email ?? null,
    },
    point: r.SamplingPoint
      ? {
          fdl_id: r.SamplingPoint.id,
          ofe_id: r.SamplingPoint.ofe_id,
          ofe_map_id: r.SamplingPoint.SamplingMap.ofe_id,
          label: r.SamplingPoint.label,
          geometry: r.SamplingPoint.geometry,
          placement_method: r.SamplingPoint.placement_method,
        }
      : null,
  }));
}

/**
 * Phone "Mark Collected" events on an OFE-owned map's points, oldest first,
 * after `afterId` (OFE's per-map cursor). Same point shape as a response's, so
 * OFE can resolve -- or, for a point dropped on the phone, create -- the
 * local point the same way.
 */
export async function listOfeMapCollections(ofeMapId: number, afterId: number, limit: number) {
  const map = await prisma.samplingMap.findUnique({ where: { ofe_id: ofeMapId }, select: { id: true, ofe_id: true } });
  if (!map) return null;
  const collections = await prisma.samplingPointCollection.findMany({
    where: { id: { gt: afterId }, SamplingPoint: { sampling_map_id: map.id } },
    orderBy: { id: "asc" },
    take: limit,
    include: {
      Contact: { select: { name: true, email: true } },
      User: { select: { name: true, email: true } },
      SamplingPoint: { select: { id: true, ofe_id: true, label: true, geometry: true, placement_method: true } },
    },
  });
  return collections.map((c) => ({
    id: c.id,
    occurred_at: c.occurred_at,
    lat: c.lat,
    lng: c.lng,
    note: c.note,
    collected_by: {
      name: c.User?.name ?? c.Contact?.name ?? null,
      email: c.User?.email ?? c.Contact?.email ?? null,
    },
    point: {
      fdl_id: c.SamplingPoint.id,
      ofe_id: c.SamplingPoint.ofe_id,
      ofe_map_id: map.ofe_id,
      label: c.SamplingPoint.label,
      geometry: c.SamplingPoint.geometry,
      placement_method: c.SamplingPoint.placement_method,
    },
  }));
}

// ---------------------------------------------------------------------------
// Read-only lock for the web edit routes
// ---------------------------------------------------------------------------

type OfeLockTarget =
  | { map: number }
  | { form: number }
  | { point: number }
  | { polygon: number }
  | { mapAssignment: number }
  | { formAssignment: number };

/**
 * 409 if the target (or the map/form a child row belongs to) is OFE-owned,
 * else null. Child rows are resolved through their own parent, not the URL's
 * [id], so a lab map's URL can't be used to reach an OFE map's point.
 * OFE would re-push over any edit made here anyway.
 */
export async function ofeLock(target: OfeLockTarget): Promise<NextResponse | null> {
  const id = Object.values(target)[0] as number;
  if (!Number.isInteger(id)) return null;
  let mapOfeId: number | null | undefined;
  let formOfeId: number | null | undefined;
  if ("map" in target) {
    mapOfeId = (await prisma.samplingMap.findUnique({ where: { id }, select: { ofe_id: true } }))?.ofe_id;
  } else if ("point" in target) {
    mapOfeId = (await prisma.samplingPoint.findUnique({ where: { id }, select: { SamplingMap: { select: { ofe_id: true } } } }))
      ?.SamplingMap.ofe_id;
  } else if ("polygon" in target) {
    mapOfeId = (
      await prisma.samplingMapPolygon.findUnique({ where: { id }, select: { SamplingMap: { select: { ofe_id: true } } } })
    )?.SamplingMap.ofe_id;
  } else if ("mapAssignment" in target) {
    mapOfeId = (
      await prisma.samplingMapAssignment.findUnique({ where: { id }, select: { SamplingMap: { select: { ofe_id: true } } } })
    )?.SamplingMap.ofe_id;
  } else if ("form" in target) {
    formOfeId = (await prisma.form.findUnique({ where: { id }, select: { ofe_id: true } }))?.ofe_id;
  } else {
    formOfeId = (await prisma.formAssignment.findUnique({ where: { id }, select: { Form: { select: { ofe_id: true } } } }))
      ?.Form.ofe_id;
  }
  if (mapOfeId != null) return ofeOwnedResponse("sampling map");
  if (formOfeId != null) return ofeOwnedResponse("form");
  return null;
}
