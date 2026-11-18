/**
 * The geometry tools behind POST /api/agent/compute/geo/:tool (docs/cartographer-agent-plan.md §4).
 * Pure: nothing is written. Inputs may be coordinates or references (point_id /
 * polygon_id on the bound map, field_id / zone_id on its farm); references
 * outside the binding are "not found". Also used by geo_drafts writes, which
 * re-run `compute` calls server-side so the model never copies coordinates.
 */
import { prisma } from "@/lib/prisma";
import type { AgentAuth } from "@/lib/agent/auth";
import {
  area, destination, gridInPolygon, inside, measure, pointsAround, randomInPolygon, shapeAround,
  stratifiedRandom, toAreaGeometry, transect,
  type AreaGeometry, type LabeledPoint, type LatLng, type PointPattern, type ShapeKind,
} from "@/lib/geo-tools";
import { randomGridSample, type GridGrouping, type GridSizing, type SamplePolygon } from "@/lib/geo-grid";

export type Body = Record<string, unknown>;
export class InputError extends Error {
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

/** Points/grid results with this many points or fewer are returned to the model in full. */
const INLINE_POINTS = 40;

/**
 * Randomized grid sampling, full result: grids (the records to store), points,
 * and draft-ready features whose points carry {grid, col, row}. The seed is
 * always resolved, so the same args (incl. `seed`) reproduce it exactly.
 */
export async function randomGridFull(agent: AgentAuth, b: Body) {
  const list = Array.isArray(b.polygons) ? b.polygons : b.polygon != null ? [b.polygon] : [];
  if (!list.length) throw new InputError("polygons must be a non-empty array of {field_id} / {polygon_id} / {zone_id}");
  if (list.length > 200) throw new InputError("at most 200 polygons");
  const polygons: SamplePolygon[] = await Promise.all(
    list.map(async (raw, i) => {
      const o = (raw ?? {}) as Body;
      const { polygon, label } = await resolvePolygon(agent, o, `polygons[${i}]`);
      const ref = Object.fromEntries(["field_id", "polygon_id", "zone_id"].filter((k) => typeof o[k] === "number").map((k) => [k, o[k]]));
      return { polygon, label: str(o, "label") ?? label ?? `P${i + 1}`, ref, rotationDeg: optNum(o, "rotation_deg") };
    }),
  );
  const given = ["total", "per_acre", "cell_size_m"].filter((k) => b[k] != null);
  if (given.length !== 1) throw new InputError("give exactly one of total, per_acre or cell_size_m");
  const sizing: GridSizing =
    b.total != null ? { total: num(b, "total"), exact: b.exact !== false }
      : b.per_acre != null ? { perAcre: num(b, "per_acre") }
        : { cellSizeM: num(b, "cell_size_m") };
  const grouping = (["auto", "shared", "per_polygon"].includes(String(b.grouping)) ? b.grouping : "auto") as GridGrouping;
  const r = randomGridSample(polygons, sizing, {
    edgeBufferM: optNum(b, "edge_buffer_m"),
    minCellFraction: optNum(b, "min_cell_fraction"),
    seed: optNum(b, "seed"),
    labelPrefix: str(b, "label_prefix"),
    grouping,
    rotationDeg: optNum(b, "rotation_deg"),
  });
  const features = {
    type: "FeatureCollection",
    features: r.points.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: { label: p.label, grid: p.meta!.grid, col: p.meta!.col, row: p.meta!.row },
    })),
  };
  return { ...r, features, args: { ...b, seed: r.seed } };
}

export const GEO_TOOLS: Record<string, (agent: AgentAuth, b: Body) => Promise<unknown>> = {
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
    const points = transect(await resolvePoint(agent, b.start, "start"), num(b, "bearing_deg"), optNum(b, "length_m"), num(b, "spacing_m"), {
      labelPrefix: str(b, "label_prefix"),
      count: optNum(b, "count"),
      startOffsetM: optNum(b, "start_offset_m"),
    });
    return { points, features: asFeatures(points) };
  },
  async random_grid_sample(agent, b) {
    const r = await randomGridFull(agent, b);
    const small = r.points.length <= INLINE_POINTS;
    return {
      summary: { ...r.summary, cell_size_m: r.cell_size_m, seed: r.seed },
      grids: r.grids.map(({ params, ...g }) => ({ ...g, polygons: params.polygons, cells_sampled: params.cells_sampled, rotation_true_deg: params.rotation_true_deg })),
      warnings: r.warnings,
      ...(small ? { points: r.points, features: r.features } : { sample_points: r.points.slice(0, 5) }),
      // write_draft re-runs this server-side — no need to copy the points.
      draft_with: { compute: [{ tool: "random_grid_sample", args: r.args }] },
    };
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

