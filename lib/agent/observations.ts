import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { pointInGeometry } from "@/lib/geo";
import type { AgentAuth } from "@/lib/agent/auth";
import { getAgentRow, getAgentTable } from "@/lib/agent/registry";

/**
 * The space-time observation map (migration 097, docs/agent-sandbox-plan.md §6a).
 *
 * Pass 1 ("observe") writes one observation per upload. The model supplies only
 * WHAT it saw; WHEN and WHERE are derived here from the source record (capture
 * timestamp, GPS, field polygon, farm), so a model can't misplace an item in
 * space or time, and an injected "this was taken at farm X" does nothing.
 * The one exception, range-checked: a date the item itself states
 * ("sprayed on June 3") may be given as content_date.
 *
 * Pass 2 ("synthesize") reads these rows by farm and time window.
 */

export class ObservationError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** Upload-like tables that can be observed, and where their capture time lives. */
export const OBSERVABLE_SOURCES: Record<string, { captureTime: string | null; uploadTime: string }> = {
  photos: { captureTime: "timestamp", uploadTime: "received_at" },
  notes: { captureTime: "timestamp", uploadTime: "received_at" },
  lab_member_uploads: { captureTime: null, uploadTime: "received_at" },
  documents: { captureTime: "timestamp", uploadTime: "uploaded_at" },
  form_responses: { captureTime: "submitted_at", uploadTime: "submitted_at" },
};

/** Fixed vocabulary so the map stays queryable. */
export const OBSERVATION_SUBJECTS = [
  "crop", "weed", "pest", "disease", "nutrient_deficiency", "water_stress", "flooding", "lodging",
  "hail_wind_damage", "soil", "residue", "cover_crop", "planting", "tillage", "spraying", "fertilizing",
  "harvest", "yield_measurement", "sampling", "equipment", "infrastructure", "livestock", "weather",
  "field_conditions", "document", "data_record", "people", "other",
] as const;

const URL_LIKE = /(https?:\/\/|ftp:\/\/|www\.|\]\(|<\/?[a-z][^>]*>|data:[a-z]+\/)/i;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const DAY_MS = 86_400_000;

type Body = Record<string, unknown>;

function plain(body: Body, key: string, max: number, required = false): string | null {
  const v = body[key];
  if (v == null || v === "") {
    if (required) throw new ObservationError(`${key} is required`);
    return null;
  }
  if (typeof v !== "string") throw new ObservationError(`${key} must be a string`);
  const s = v.replace(CONTROL_CHARS, "").trim();
  if (required && !s) throw new ObservationError(`${key} is required`);
  if (s.length > max) throw new ObservationError(`${key} is longer than ${max} characters`);
  if (URL_LIKE.test(s)) throw new ObservationError(`${key} must be plain text — no URLs, links or HTML`);
  return s || null;
}

function asDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** [lng, lat] of a GeoJSON Point string, else null. */
function pointFromGeoJSON(s: unknown): { lat: number; lng: number } | null {
  if (typeof s !== "string") return null;
  try {
    const g = JSON.parse(s);
    const geom = g?.type === "Feature" ? g.geometry : g;
    if (geom?.type === "Point" && Array.isArray(geom.coordinates)) {
      const [lng, lat] = geom.coordinates;
      if (typeof lat === "number" && typeof lng === "number") return { lat, lng };
    }
  } catch {}
  return null;
}

/** The field of `farmId` whose polygon contains the point — only that farm's fields are considered. */
async function fieldAtPoint(farmId: number, lat: number, lng: number): Promise<number | null> {
  const fields = await prisma.field.findMany({
    where: { Farms_id: farmId, geometry: { not: null } },
    select: { id: true, geometry: true },
  });
  for (const f of fields) {
    try {
      if (f.geometry && pointInGeometry(lat, lng, JSON.parse(f.geometry))) return f.id;
    } catch {}
  }
  return null;
}

interface WhenWhere {
  farm_id: number | null;
  field_id: number | null;
  latitude: number | null;
  longitude: number | null;
  location_source: "gps" | "field" | "farm" | "unknown";
  observed_at: Date | null;
  time_source: "capture" | "upload" | "unknown";
}

/** WHEN and WHERE from the source record itself. */
export async function deriveWhenWhere(table: string, row: Record<string, unknown>): Promise<WhenWhere> {
  const src = OBSERVABLE_SOURCES[table];
  const capture = src.captureTime ? asDate(row[src.captureTime]) : null;
  const upload = asDate(row[src.uploadTime]);
  const observed_at = capture ?? upload;
  const time_source = capture ? "capture" : upload ? "upload" : "unknown";

  const farm_id = num(row.farm_id);
  let field_id = num(row.field_id);
  let lat = num(row.latitude);
  let lng = num(row.longitude);

  if ((lat == null || lng == null) && table === "form_responses" && num(row.sampling_point_id) != null) {
    const sp = await prisma.samplingPoint.findUnique({
      where: { id: row.sampling_point_id as number },
      select: { geometry: true },
    });
    const p = pointFromGeoJSON(sp?.geometry);
    if (p) ({ lat, lng } = p);
  }

  if (lat != null && lng != null) {
    if (field_id == null && farm_id != null) field_id = await fieldAtPoint(farm_id, lat, lng);
    return { farm_id, field_id, latitude: lat, longitude: lng, location_source: "gps", observed_at, time_source };
  }
  return {
    farm_id,
    field_id,
    latitude: null,
    longitude: null,
    location_source: field_id != null ? "field" : farm_id != null ? "farm" : "unknown",
    observed_at,
    time_source,
  };
}

/**
 * Validate the model's WHAT, derive WHEN/WHERE, and store — superseding the
 * source's previous current observation in the same transaction. `claim` is
 * the shared run/budget check from lib/agent/writes.ts.
 */
export async function writeObservation(
  agent: AgentAuth,
  body: Body,
  claim: (agent: AgentAuth, body: Body) => Promise<number>,
) {
  const table = body.source_table;
  if (typeof table !== "string" || !(table in OBSERVABLE_SOURCES) || !getAgentTable(table)) {
    throw new ObservationError(`source_table must be one of: ${Object.keys(OBSERVABLE_SOURCES).join(", ")}`);
  }
  const id = body.source_id;
  if (typeof id !== "number" || !Number.isInteger(id)) throw new ObservationError("source_id must be an integer");
  const row = await getAgentRow(table, agent.labId, id);
  if (!row) throw new ObservationError(`source: ${table} #${id} not found`, 404);

  // WHAT
  const rawSubjects = body.subjects ?? [];
  if (!Array.isArray(rawSubjects) || rawSubjects.length > 6) throw new ObservationError("subjects must be an array of at most 6");
  const subjects = [...new Set(rawSubjects.map((s) => (typeof s === "string" ? s.trim().toLowerCase() : "")))];
  const unknown = subjects.filter((s) => !(OBSERVATION_SUBJECTS as readonly string[]).includes(s));
  if (unknown.length) throw new ObservationError(`unknown subject(s) ${unknown.join(", ")}; allowed: ${OBSERVATION_SUBJECTS.join(", ")}`);
  const what = {
    description: plain(body, "description", 600, true)!,
    crop: plain(body, "crop", 60),
    growth_stage: plain(body, "growth_stage", 40),
    extracted_text: plain(body, "extracted_text", 1000),
    suspected_injection: body.suspected_injection === true,
    confidence: (() => {
      const c = body.confidence;
      if (c == null) return null;
      if (typeof c !== "number" || c < 0 || c > 1) throw new ObservationError("confidence must be a number from 0 to 1");
      return c;
    })(),
  };

  // WHEN / WHERE
  const ww = await deriveWhenWhere(table, row);
  let observed_at: Date | null = ww.observed_at;
  let time_source: string = ww.time_source;
  if (body.content_date != null) {
    // A date the item itself states. Must be before the item was captured and
    // within ~13 months of it — anything else is a misread or a plant.
    if (typeof body.content_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.content_date)) {
      throw new ObservationError("content_date must be YYYY-MM-DD");
    }
    const d = new Date(`${body.content_date}T12:00:00Z`);
    const ref = ww.observed_at ?? new Date();
    if (Number.isNaN(d.getTime()) || d.getTime() > ref.getTime() + DAY_MS || d.getTime() < ref.getTime() - 400 * DAY_MS) {
      throw new ObservationError("content_date must be on or before the item's own date and within 400 days of it");
    }
    observed_at = d;
    time_source = "content";
  }
  let field_id = ww.field_id;
  let location_source: string = ww.location_source;
  if (body.content_field_id != null) {
    // A field the item names ("north 40", "Field 7"), only when the record has no
    // GPS or field of its own, and only one of the same farm's fields.
    if (ww.location_source !== "farm") throw new ObservationError("content_field_id is only for items located at farm level");
    const fid = body.content_field_id;
    if (typeof fid !== "number" || !Number.isInteger(fid)) throw new ObservationError("content_field_id must be an integer");
    const field = await prisma.field.findFirst({ where: { id: fid, Farms_id: ww.farm_id! }, select: { id: true } });
    if (!field) throw new ObservationError(`field ${fid} is not one of this farm's fields`, 404);
    field_id = fid;
    location_source = "content";
  }

  const model = plain(body, "model", 120);
  const prompt_sha256 = typeof body.prompt_sha256 === "string" && /^[0-9a-f]{64}$/.test(body.prompt_sha256) ? body.prompt_sha256 : null;

  const run_id = await claim(agent, body);
  return prisma.$transaction(async (tx) => {
    await tx.agentObservation.updateMany({
      where: { lab_id: agent.labId, source_table: table, source_id: id, status: "current" },
      data: { status: "superseded" },
    });
    return tx.agentObservation.create({
      data: {
        lab_id: agent.labId,
        run_id,
        source_table: table,
        source_id: id,
        farm_id: ww.farm_id,
        field_id,
        latitude: ww.latitude,
        longitude: ww.longitude,
        location_source,
        observed_at,
        time_source,
        subjects,
        ...what,
        model,
        prompt_sha256,
      },
      select: { id: true, farm_id: true, field_id: true, observed_at: true, location_source: true, time_source: true },
    });
  });
}

// ── reads ───────────────────────────────────────────────────────────────────

const LIST_MAX = 500;

/** Current observations for a farm (or all farms) in a time window, oldest first. */
export async function listObservations(labId: number, params: URLSearchParams) {
  const where: Prisma.AgentObservationWhereInput = { lab_id: labId, status: "current" };
  const farm = params.get("farm_id");
  if (farm) {
    const n = Number.parseInt(farm, 10);
    if (Number.isNaN(n)) throw new ObservationError("farm_id must be an integer");
    where.farm_id = n;
  }
  const field = params.get("field_id");
  if (field) {
    const n = Number.parseInt(field, 10);
    if (Number.isNaN(n)) throw new ObservationError("field_id must be an integer");
    where.field_id = n;
  }
  const from = params.get("from");
  const to = params.get("to");
  if (from || to) {
    const range: Prisma.DateTimeNullableFilter = {};
    if (from) {
      const d = asDate(from);
      if (!d) throw new ObservationError("from must be an ISO date");
      range.gte = d;
    }
    if (to) {
      const d = asDate(to);
      if (!d) throw new ObservationError("to must be an ISO date");
      // A bare date means the whole day.
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) range.lt = new Date(d.getTime() + DAY_MS);
      else range.lte = d;
    }
    where.observed_at = range;
  }
  const subject = params.get("subject");
  if (subject) where.subjects = { has: subject };
  const since = params.get("created_since");
  if (since) {
    const d = asDate(since);
    if (!d) throw new ObservationError("created_since must be an ISO timestamp");
    where.created_at = { gte: d };
  }
  const limit = Math.min(Math.max(Number(params.get("limit") ?? 200) || 200, 1), LIST_MAX);
  const offset = Math.max(Number(params.get("offset") ?? 0) || 0, 0);

  const [total, rows] = await Promise.all([
    prisma.agentObservation.count({ where }),
    prisma.agentObservation.findMany({
      where,
      orderBy: [{ observed_at: "asc" }, { id: "asc" }],
      take: limit,
      skip: offset,
      select: {
        id: true, source_table: true, source_id: true, farm_id: true, field_id: true,
        latitude: true, longitude: true, location_source: true, observed_at: true, time_source: true,
        subjects: true, crop: true, growth_stage: true, description: true, extracted_text: true,
        suspected_injection: true, confidence: true,
      },
    }),
  ]);
  return { total, limit, offset, agent_authored: true, rows };
}

/**
 * Upload rows (of one table) in the lab that have no current observation, or —
 * with prompt_sha256 — none made with that prompt. Newest first.
 */
export async function pendingSources(labId: number, params: URLSearchParams) {
  const table = params.get("table") ?? "";
  if (!(table in OBSERVABLE_SOURCES)) throw new ObservationError(`table must be one of: ${Object.keys(OBSERVABLE_SOURCES).join(", ")}`);
  const limit = Math.min(Math.max(Number(params.get("limit") ?? 50) || 50, 1), LIST_MAX);
  const prompt = params.get("prompt_sha256");

  const observed = await prisma.agentObservation.findMany({
    where: {
      lab_id: labId,
      source_table: table,
      status: "current",
      ...(prompt && /^[0-9a-f]{64}$/.test(prompt) ? { prompt_sha256: prompt } : {}),
    },
    select: { source_id: true },
  });
  const skip = new Set(observed.map((o) => o.source_id));

  // Page through the lab's rows newest-first until `limit` unobserved ones are found.
  const ids: number[] = [];
  const t = getAgentTable(table)!;
  const scope = await t.scope(labId);
  const delegate = (prisma as unknown as Record<string, { findMany(a: unknown): Promise<{ id: number }[]> }>)[
    t.model.charAt(0).toLowerCase() + t.model.slice(1)
  ];
  for (let offset = 0; ids.length < limit; offset += 500) {
    const page = await delegate.findMany({ where: scope, select: { id: true }, orderBy: { id: "desc" }, take: 500, skip: offset });
    for (const r of page) if (!skip.has(r.id) && ids.length < limit) ids.push(r.id);
    if (page.length < 500) break;
  }
  return { table, ids };
}
