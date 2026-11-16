import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AgentAuth } from "@/lib/agent/auth";
import type { AgentKind } from "@/lib/agent/kinds";
import { pointInGeojsonString } from "@/lib/geo";
import { measure } from "@/lib/geo-tools";

/**
 * Interactive agent requests and geometry drafts (migration 099,
 * docs/cartographer-agent-plan.md §5.1a–5.3).
 *
 *   person ──create──▶ queued ──claim (binds the run to the map)──▶ claimed
 *          ◀──answer── done | failed          (agent writes drafts meanwhile)
 *   person ──apply / discard / undo──▶ draft status
 *
 * The agent never writes sampling data: it writes drafts, and applying one is
 * the person's action through applyDraft() — INSERT only, every row tagged with
 * agent_draft_id so undoDraft() removes exactly those rows.
 */

export class RequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const URL_LIKE = /(https?:\/\/|ftp:\/\/|www\.|\]\(|<\/?[a-z][^>]*>|data:[a-z]+\/)/i;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function plain(v: unknown, key: string, max: number, required = false): string | null {
  if (v == null || v === "") {
    if (required) throw new RequestError(`${key} is required`);
    return null;
  }
  if (typeof v !== "string") throw new RequestError(`${key} must be a string`);
  const s = v.replace(CONTROL_CHARS, "").trim();
  if (required && !s) throw new RequestError(`${key} is required`);
  if (s.length > max) throw new RequestError(`${key} is longer than ${max} characters`);
  if (URL_LIKE.test(s)) throw new RequestError(`${key} must be plain text — no URLs, links or HTML`);
  return s || null;
}

/** Unclaimed requests older than this are expired ("the agent is offline"). */
export const REQUEST_TTL_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_USER_PER_HOUR = 30;

// ── people: create / list / cancel ──────────────────────────────────────────

export async function createRequest(opts: {
  labId: number;
  userId: string;
  kind: AgentKind;
  samplingMapId: number;
  prompt: unknown;
  context?: unknown;
  channel?: "web" | "app";
}) {
  const prompt = plain(opts.prompt, "prompt", 2000, true)!;
  let context: Prisma.InputJsonObject = {};
  if (opts.context != null) {
    if (typeof opts.context !== "object" || Array.isArray(opts.context)) throw new RequestError("context must be an object");
    const c = opts.context as Record<string, unknown>;
    // Only ids the agent can resolve itself; they're re-checked against the bound map.
    for (const k of ["point_id", "polygon_id"]) {
      if (c[k] != null && !(typeof c[k] === "number" && Number.isInteger(c[k]))) throw new RequestError(`context.${k} must be an integer`);
    }
    context = Object.fromEntries(["point_id", "polygon_id"].filter((k) => c[k] != null).map((k) => [k, c[k] as number]));
  }
  const recent = await prisma.agentRequest.count({
    where: { requested_by_id: opts.userId, created_at: { gte: new Date(Date.now() - 3600_000) } },
  });
  if (recent >= MAX_REQUESTS_PER_USER_PER_HOUR) throw new RequestError("Too many requests this hour — try again later", 429);

  return prisma.agentRequest.create({
    data: {
      lab_id: opts.labId,
      agent_kind: opts.kind,
      requested_by_id: opts.userId,
      channel: opts.channel ?? "web",
      sampling_map_id: opts.samplingMapId,
      prompt,
      context,
    },
  });
}

export async function expireStale(kind?: AgentKind) {
  await prisma.agentRequest.updateMany({
    where: { status: "queued", created_at: { lt: new Date(Date.now() - REQUEST_TTL_MS) }, ...(kind ? { agent_kind: kind } : {}) },
    data: { status: "expired", answer: "No agent picked this up in time — the agent may be offline." },
  });
}

/**
 * Called when a run closes: a request it claimed but never answered (crash,
 * refused answer) would otherwise show "Working…" forever.
 */
export async function failUnansweredForRun(runId: number) {
  await prisma.agentRequest.updateMany({
    where: { status: "claimed", run_id: runId },
    data: { status: "failed", answer: "The agent stopped before answering. Please try again." },
  });
}

/** Requests on a map, newest first, with their drafts. */
export async function listRequests(samplingMapId: number, limit = 30) {
  await expireStale();
  return prisma.agentRequest.findMany({
    where: { sampling_map_id: samplingMapId },
    orderBy: { created_at: "desc" },
    take: limit,
    include: { Drafts: { orderBy: { id: "asc" } } },
  });
}

// ── agents: claim / answer ──────────────────────────────────────────────────

/**
 * Atomically claim the oldest queued request of this agent's kind in its lab
 * and bind `runId` to that request's map. A run claims at most one request.
 */
export async function claimRequest(agent: AgentAuth, runId: number) {
  const run = await prisma.agentRun.findFirst({
    where: { id: runId, token_id: agent.token.id, lab_id: agent.labId, status: "open" },
    select: { id: true, scope_map_id: true, request_id: true },
  });
  if (!run) throw new RequestError(`run ${runId} not found or not open`, 404);
  if (run.request_id) throw new RequestError(`run ${runId} already claimed request ${run.request_id} — one request per run`, 409);

  await expireStale(agent.kind);
  for (let attempt = 0; attempt < 5; attempt++) {
    const next = await prisma.agentRequest.findFirst({
      where: { lab_id: agent.labId, agent_kind: agent.kind, status: "queued" },
      orderBy: { created_at: "asc" },
      select: { id: true },
    });
    if (!next) return null;
    const claimed = await prisma.$transaction(async (tx) => {
      const n = await tx.agentRequest.updateMany({
        where: { id: next.id, status: "queued" },
        data: { status: "claimed", run_id: runId, claimed_at: new Date() },
      });
      if (n.count !== 1) return null; // someone else got it
      await tx.agentRun.update({
        where: { id: runId },
        data: { request_id: next.id, scope_map_id: (await tx.agentRequest.findUnique({ where: { id: next.id }, select: { sampling_map_id: true } }))!.sampling_map_id },
      });
      return tx.agentRequest.findUnique({ where: { id: next.id } });
    });
    if (claimed) {
      const map = await prisma.samplingMap.findUnique({
        where: { id: claimed.sampling_map_id },
        select: { id: true, name: true, farm_id: true, description: true, ofe_id: true, Farm: { select: { Farm_Name: true } } },
      });
      return {
        request_id: claimed.id,
        prompt: claimed.prompt,
        context: claimed.context,
        channel: claimed.channel,
        sampling_map: map && {
          id: map.id,
          name: map.name,
          description: map.description,
          farm_id: map.farm_id,
          farm_name: map.Farm?.Farm_Name ?? null,
          ofe_owned: map.ofe_id != null,
        },
      };
    }
  }
  return null;
}

export async function answerRequest(agent: AgentAuth, requestId: number, body: Record<string, unknown>) {
  if (!agent.binding || agent.binding.requestId !== requestId) {
    throw new RequestError(`request ${requestId} is not this run's request`, 404);
  }
  const status = body.status === "failed" ? "failed" : "done";
  const answer = plain(body.answer, "answer", 2000) ?? (status === "failed" ? "The agent couldn't complete this." : "Done.");
  const n = await prisma.agentRequest.updateMany({
    where: { id: requestId, status: "claimed", run_id: agent.binding.runId },
    data: { status, answer },
  });
  if (n.count !== 1) throw new RequestError(`request ${requestId} is not open`, 409);
  return { request_id: requestId, status };
}

// ── agents: geometry drafts ─────────────────────────────────────────────────

const MAX_DRAFT_FEATURES = 2000;
const MAX_DRAFTS_PER_REQUEST = 5;
const MAX_DISTANCE_FROM_FARM_M = 10_000;
const POLYGON_PURPOSES = ["boundary", "stratum", "exclusion"];

type Feature = { type: "Feature"; geometry: { type: "Point" | "Polygon"; coordinates: unknown }; properties: Record<string, unknown> };

function finitePair(c: unknown): c is [number, number] {
  return Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) && Math.abs(c[0] as number) <= 180 && Math.abs(c[1] as number) <= 90;
}

/**
 * Reference points a draft must be near: the farm's geocode, its first field,
 * and the map's own first polygon and point. Any one is enough, so a map whose
 * data doesn't match the farm record (e.g. synced test data) still works, while
 * a feature on the other side of the world is still refused.
 */
async function draftAnchors(farmId: number, mapId: number): Promise<{ lat: number; lng: number }[]> {
  const anchors: { lat: number; lng: number }[] = [];
  const farm = await prisma.farm.findUnique({ where: { id: farmId }, select: { latitude: true, longitude: true } });
  if (farm?.latitude != null && farm.longitude != null) anchors.push({ lat: farm.latitude, lng: farm.longitude });
  const geoms = [
    ...(await prisma.field.findMany({ where: { Farms_id: farmId, geometry: { not: null } }, select: { geometry: true }, take: 1 })).map((f) => f.geometry),
    ...(await prisma.samplingMapPolygon.findMany({ where: { sampling_map_id: mapId }, select: { geometry: true }, take: 1 })).map((p) => p.geometry),
    ...(await prisma.samplingPoint.findMany({ where: { sampling_map_id: mapId }, select: { geometry: true }, take: 1 })).map((p) => p.geometry),
  ];
  for (const g of geoms) {
    try {
      const parsed = JSON.parse(g!);
      let c: unknown = parsed.coordinates;
      while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
      if (finitePair(c)) anchors.push({ lat: c[1], lng: c[0] });
    } catch {}
  }
  return anchors;
}

export async function writeGeoDraft(
  agent: AgentAuth,
  body: Record<string, unknown>,
  claim: (agent: AgentAuth, body: Record<string, unknown>) => Promise<number>,
) {
  const b = agent.binding;
  if (!b) throw new RequestError("no claimed request for this run", 403);
  if (body.sampling_map_id != null && body.sampling_map_id !== b.mapId) {
    throw new RequestError(`sampling map ${String(body.sampling_map_id)} not found`, 404); // same answer as "doesn't exist"
  }
  if (body.run_id !== b.runId) throw new RequestError("run_id doesn't match this run", 403);
  const drafts = await prisma.agentGeometryDraft.count({ where: { request_id: b.requestId } });
  if (drafts >= MAX_DRAFTS_PER_REQUEST) throw new RequestError(`at most ${MAX_DRAFTS_PER_REQUEST} drafts per request`, 429);

  const fc = body.features as { type?: string; features?: unknown[] } | undefined;
  if (!fc || fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) throw new RequestError("features must be a GeoJSON FeatureCollection");
  if (!fc.features.length) throw new RequestError("features is empty");
  if (fc.features.length > MAX_DRAFT_FEATURES) throw new RequestError(`at most ${MAX_DRAFT_FEATURES} features`);

  const anchors = await draftAnchors(b.farmId, b.mapId);
  const clean: Feature[] = fc.features.map((raw, i) => {
    const f = raw as { type?: string; geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> };
    const g = f?.geometry;
    if (f?.type !== "Feature" || !g) throw new RequestError(`features[${i}] must be a Feature`);
    let check: [number, number][];
    if (g.type === "Point") {
      if (!finitePair(g.coordinates)) throw new RequestError(`features[${i}] has invalid coordinates`);
      check = [g.coordinates];
    } else if (g.type === "Polygon") {
      const rings = g.coordinates as unknown[];
      if (!Array.isArray(rings) || !rings.length || rings.some((r) => !Array.isArray(r) || r.length < 4 || !r.every(finitePair))) {
        throw new RequestError(`features[${i}] is not a valid polygon`);
      }
      check = (rings as [number, number][][]).flat();
    } else {
      throw new RequestError(`features[${i}]: only Point and Polygon features`);
    }
    const near = (lng: number, lat: number) => anchors.some((a) => measure(a, { lat, lng }).distanceM <= MAX_DISTANCE_FROM_FARM_M);
    if (anchors.length && check.some(([lng, lat]) => !near(lng, lat))) {
      throw new RequestError(`features[${i}] is more than ${MAX_DISTANCE_FROM_FARM_M / 1000} km from this farm and map`);
    }
    const props = f.properties ?? {};
    const label = plain(props.label, `features[${i}].label`, 80);
    const purpose = g.type === "Polygon" ? (POLYGON_PURPOSES.includes(String(props.purpose)) ? String(props.purpose) : "boundary") : undefined;
    return { type: "Feature", geometry: { type: g.type, coordinates: g.coordinates }, properties: { ...(label ? { label } : {}), ...(purpose ? { purpose } : {}) } };
  });

  const explanation = plain(body.explanation, "explanation", 1000);
  const provenance = body.provenance ?? [];
  if (!Array.isArray(provenance) || provenance.length > 50) throw new RequestError("provenance must be an array of at most 50 tool calls");
  if (JSON.stringify(provenance).length > 32_000) throw new RequestError("provenance is too large");
  if (URL_LIKE.test(JSON.stringify(provenance))) throw new RequestError("provenance must be plain data — no URLs");

  const run_id = await claim(agent, body);
  return prisma.agentGeometryDraft.create({
    data: {
      lab_id: agent.labId,
      request_id: b.requestId,
      run_id,
      sampling_map_id: b.mapId,
      features: { type: "FeatureCollection", features: clean } as unknown as Prisma.InputJsonObject,
      explanation,
      provenance: provenance as Prisma.InputJsonArray,
    },
    select: { id: true, sampling_map_id: true },
  });
}

// ── people: apply / discard / undo ──────────────────────────────────────────

export async function applyDraft(draftId: number, userId: string) {
  return prisma.$transaction(async (tx) => {
    const draft = await tx.agentGeometryDraft.findUnique({ where: { id: draftId } });
    if (!draft) throw new RequestError("draft not found", 404);
    const claimed = await tx.agentGeometryDraft.updateMany({
      where: { id: draftId, status: "draft" },
      data: { status: "applied", applied_by_id: userId, applied_at: new Date() },
    });
    if (claimed.count !== 1) throw new RequestError(`draft is ${draft.status}`, 409);

    const features = ((draft.features as unknown as { features: Feature[] }).features ?? []);
    const polygons = [];
    for (const f of features.filter((x) => x.geometry.type === "Polygon")) {
      polygons.push(await tx.samplingMapPolygon.create({
        data: {
          sampling_map_id: draft.sampling_map_id,
          label: (f.properties.label as string) ?? null,
          purpose: (f.properties.purpose as string) ?? "boundary",
          geometry: JSON.stringify(f.geometry),
          source: "agent",
          agent_draft_id: draft.id,
        },
      }));
    }
    const mapPolygons = [
      ...(await tx.samplingMapPolygon.findMany({ where: { sampling_map_id: draft.sampling_map_id }, select: { id: true, geometry: true } })),
    ];
    const points = [];
    let i = 0;
    for (const f of features.filter((x) => x.geometry.type === "Point")) {
      const [lng, lat] = f.geometry.coordinates as [number, number];
      const inside = mapPolygons.find((p) => pointInGeojsonString(lat, lng, p.geometry));
      points.push(await tx.samplingPoint.create({
        data: {
          sampling_map_id: draft.sampling_map_id,
          polygon_id: inside?.id ?? null,
          label: (f.properties.label as string) ?? null,
          geometry: JSON.stringify(f.geometry),
          placement_method: "agent",
          sample_index: i++,
          agent_draft_id: draft.id,
        },
      }));
    }
    return { draft_id: draft.id, points, polygons };
  });
}

export async function discardDraft(draftId: number) {
  const n = await prisma.agentGeometryDraft.updateMany({ where: { id: draftId, status: "draft" }, data: { status: "discarded" } });
  if (n.count !== 1) throw new RequestError("only an unapplied draft can be discarded", 409);
  return { draft_id: draftId, status: "discarded" };
}

/** Remove exactly the rows a draft added — refused if any of its points has collected data. */
export async function undoDraft(draftId: number) {
  return prisma.$transaction(async (tx) => {
    const draft = await tx.agentGeometryDraft.findUnique({ where: { id: draftId }, select: { status: true } });
    if (!draft) throw new RequestError("draft not found", 404);
    if (draft.status !== "applied") throw new RequestError("only an applied draft can be undone", 409);
    const pts = await tx.samplingPoint.findMany({
      where: { agent_draft_id: draftId },
      select: { id: true, _count: { select: { Collections: true, FormResponses: true } } },
    });
    const withData = pts.filter((p) => p._count.Collections + p._count.FormResponses > 0);
    if (withData.length) {
      throw new RequestError(`${withData.length} of these points already have collected data — remove them by hand if you're sure`, 409);
    }
    const polys = await tx.samplingMapPolygon.findMany({ where: { agent_draft_id: draftId }, select: { id: true } });
    await tx.samplingPoint.deleteMany({ where: { agent_draft_id: draftId } });
    await tx.samplingMapPolygon.deleteMany({ where: { agent_draft_id: draftId } });
    await tx.agentGeometryDraft.update({ where: { id: draftId }, data: { status: "undone" } });
    return { draft_id: draftId, removed_point_ids: pts.map((p) => p.id), removed_polygon_ids: polys.map((p) => p.id) };
  });
}
