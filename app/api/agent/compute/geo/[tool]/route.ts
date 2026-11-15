import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAgent, type AgentAuth } from "@/lib/agent/auth";
import {
  area, destination, gridInPolygon, inside, measure, pointsAround, randomInPolygon, shapeAround,
  stratifiedRandom, toAreaGeometry, transect, GeoToolError,
  type AreaGeometry, type LabeledPoint, type LatLng, type PointPattern, type ShapeKind,
} from "@/lib/geo-tools";

// POST /api/agent/compute/geo/:tool — deterministic geometry for map-bound agents
// (docs/cartographer-agent-plan.md §4). Pure: nothing is written. Inputs may be
// coordinates or references (point_id / polygon_id on the bound map, field_id /
// zone_id on its farm); references outside the binding are "not found".
// Results include a GeoJSON FeatureCollection ready for a geo_drafts write.

type Body = Record<string, unknown>;
class InputError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const num = (b: Body, k: string, def?: number): number => {
  const v = b[k] ?? def;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new InputError(`${k} must be a number`);
  return v;
};
const optNum = (b: Body, k: string): number | undefined => (b[k] == null ? undefined : num(b, k));
const str = (b: Body, k: string): string | undefined => (typeof b[k] === "string" ? (b[k] as string).slice(0, 60) : undefined);

function pointGeom(s: string | null | undefined): LatLng | null {
  try {
    const g = JSON.parse(s ?? "");
    if (g?.type === "Point" && Array.isArray(g.coordinates)) return { lat: g.coordinates[1], lng: g.coordinates[0] };
  } catch {}
  return null;
}

async function resolvePoint(agent: AgentAuth, v: unknown, key: string): Promise<LatLng> {
  const b = agent.binding!;
  const o = (v ?? {}) as Body;
  if (typeof o.point_id === "number") {
    const p = await prisma.samplingPoint.findFirst({ where: { id: o.point_id, sampling_map_id: b.mapId }, select: { geometry: true } });
    const ll = pointGeom(p?.geometry);
    if (!ll) throw new InputError(`${key}: point ${o.point_id} not found`, 404);
    return ll;
  }
  if (typeof o.lat === "number" && typeof o.lng === "number") return { lat: o.lat, lng: o.lng };
  throw new InputError(`${key} must be {lat, lng} or {point_id}`);
}

async function resolvePolygon(agent: AgentAuth, v: unknown, key: string): Promise<{ polygon: AreaGeometry; label?: string }> {
  const b = agent.binding!;
  const o = (v ?? {}) as Body;
  let geometry: string | null | undefined;
  let label: string | undefined;
  if (typeof o.polygon_id === "number") {
    const p = await prisma.samplingMapPolygon.findFirst({ where: { id: o.polygon_id, sampling_map_id: b.mapId }, select: { geometry: true, label: true } });
    geometry = p?.geometry;
    label = p?.label ?? undefined;
  } else if (typeof o.field_id === "number") {
    const f = await prisma.field.findFirst({ where: { id: o.field_id, Farms_id: b.farmId }, select: { geometry: true, Name: true } });
    geometry = f?.geometry;
    label = f?.Name ?? undefined;
  } else if (typeof o.zone_id === "number") {
    const z = await prisma.experimentZone.findFirst({ where: { id: o.zone_id, farm_id: b.farmId }, select: { geometry: true, Zone_Label: true } });
    geometry = z?.geometry;
    label = z?.Zone_Label ?? undefined;
  } else if (o.type === "Polygon" || o.type === "MultiPolygon" || o.type === "Feature") {
    return { polygon: toAreaGeometry(o) };
  } else {
    throw new InputError(`${key} must be {polygon_id}, {field_id}, {zone_id} or a GeoJSON polygon`);
  }
  if (!geometry) throw new InputError(`${key}: not found`, 404);
  return { polygon: toAreaGeometry(geometry), label };
}

function asFeatures(points: LabeledPoint[], polygons: { geometry: AreaGeometry; label?: string }[] = []) {
  return {
    type: "FeatureCollection",
    features: [
      ...polygons.map((p) => ({ type: "Feature", geometry: p.geometry, properties: p.label ? { label: p.label } : {} })),
      ...points.map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: [p.lng, p.lat] }, properties: { label: p.label } })),
    ],
  };
}

const TOOLS: Record<string, (agent: AgentAuth, b: Body) => Promise<unknown>> = {
  async destination(agent, b) {
    const p = destination(await resolvePoint(agent, b.from, "from"), num(b, "bearing_deg"), num(b, "distance_m"));
    return { point: p };
  },
  async measure(agent, b) {
    return measure(await resolvePoint(agent, b.a, "a"), await resolvePoint(agent, b.b, "b"));
  },
  async points_around(agent, b) {
    const points = pointsAround(await resolvePoint(agent, b.center, "center"), String(b.pattern) as PointPattern, num(b, "size_m"), {
      rotationDeg: optNum(b, "rotation_deg"),
      count: optNum(b, "count"),
      includeCenter: b.include_center === true,
      labelPrefix: str(b, "label_prefix"),
    });
    return { points, features: asFeatures(points) };
  },
  async shape_around(agent, b) {
    const geometry = shapeAround(await resolvePoint(agent, b.center, "center"), String(b.shape) as ShapeKind, num(b, "size_m"), {
      heightM: optNum(b, "height_m"),
      rotationDeg: optNum(b, "rotation_deg"),
    });
    return { polygon: geometry, area_m2: area(geometry), features: asFeatures([], [{ geometry, label: str(b, "label") }]) };
  },
  async grid_in_polygon(agent, b) {
    const { polygon, label } = await resolvePolygon(agent, b.polygon, "polygon");
    const points = gridInPolygon(polygon, num(b, "spacing_m"), {
      edgeBufferM: optNum(b, "edge_buffer_m"),
      rotationDeg: optNum(b, "rotation_deg"),
      labelPrefix: str(b, "label_prefix") ?? label,
    });
    return { points, count: points.length, features: asFeatures(points) };
  },
  async random_in_polygon(agent, b) {
    const { polygon, label } = await resolvePolygon(agent, b.polygon, "polygon");
    const r = randomInPolygon(polygon, num(b, "count"), {
      minSpacingM: optNum(b, "min_spacing_m"),
      edgeBufferM: optNum(b, "edge_buffer_m"),
      seed: optNum(b, "seed"),
      labelPrefix: str(b, "label_prefix") ?? label,
    });
    return { ...r, features: asFeatures(r.points) };
  },
  async stratified_random(agent, b) {
    if (!Array.isArray(b.strata) || !b.strata.length) throw new InputError("strata must be a non-empty array");
    const strata = await Promise.all(
      (b.strata as unknown[]).slice(0, 200).map(async (s, i) => {
        const { polygon, label } = await resolvePolygon(agent, s, `strata[${i}]`);
        return { id: i + 1, label: str(s as Body, "label") ?? label ?? `S${i + 1}`, polygon };
      }),
    );
    const allocation =
      b.per_stratum != null
        ? { perStratum: num(b, "per_stratum") }
        : { total: num(b, "total"), mode: (b.mode === "equal" ? "equal" : "proportional") as "equal" | "proportional", minPerStratum: optNum(b, "min_per_stratum") };
    const r = stratifiedRandom(strata, allocation, { minSpacingM: optNum(b, "min_spacing_m"), edgeBufferM: optNum(b, "edge_buffer_m"), seed: optNum(b, "seed") });
    return { ...r, features: asFeatures(r.points) };
  },
  async transect(agent, b) {
    const points = transect(await resolvePoint(agent, b.start, "start"), num(b, "bearing_deg"), num(b, "length_m"), num(b, "spacing_m"), {
      labelPrefix: str(b, "label_prefix"),
    });
    return { points, features: asFeatures(points) };
  },
  async area(agent, b) {
    const { polygon } = await resolvePolygon(agent, b.polygon, "polygon");
    const m2 = area(polygon);
    return { area_m2: m2, area_ha: m2 / 10_000, area_ac: m2 / 4046.856 };
  },
  async inside(agent, b) {
    const { polygon } = await resolvePolygon(agent, b.polygon, "polygon");
    return { inside: inside(await resolvePoint(agent, b.point, "point"), polygon) };
  },
};

export async function POST(req: Request, { params }: { params: Promise<{ tool: string }> }) {
  return withAgent(req, "compute", async (agent) => {
    const { tool } = await params;
    const fn = Object.prototype.hasOwnProperty.call(TOOLS, tool) ? TOOLS[tool] : null;
    if (!fn) return NextResponse.json({ error: `unknown tool; one of: ${Object.keys(TOOLS).join(", ")}` }, { status: 404 });
    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
    try {
      return NextResponse.json({ tool, result: await fn(agent, body) });
    } catch (e) {
      if (e instanceof GeoToolError) return NextResponse.json({ error: e.message }, { status: 400 });
      if (e instanceof InputError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }
  });
}
