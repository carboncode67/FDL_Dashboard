/**
 * Random grid sampling (Cartographer skill "grid sampling"; docs/cartographer-agent-plan.md §4a).
 *
 * Lay a square grid over one or more polygons and place ONE uniformly random
 * point inside each grid cell (the part of the cell inside the sampled area).
 * Pure and deterministic: the same grid record + polygons reproduce the same
 * points exactly, so a grid can be stored as a handful of numbers
 * (Sampling_Grids) and recreated later for analysis in any GIS.
 *
 * ── The grid record (what "recreate the grid" needs) ─────────────────────────
 *   crs           "EPSG:326zz" / "EPSG:327zz" — WGS84 / UTM zone zz (N / S)
 *   origin_x/_y   the grid origin in that CRS (metres) — the SW corner of cell (0,0)
 *   cell_size_m   side of each square cell (metres, in the CRS)
 *   rotation_deg  clockwise rotation of the grid from the CRS's grid north
 *                 (NOT true north; true bearing = rotation_deg − convergence)
 * Cell (col,row) is the square  col·s ≤ u < (col+1)·s,  row·s ≤ v < (row+1)·s
 * where, for a CRS position (E, N) and θ = rotation_deg,
 *   u =  cosθ·(E−E0) − sinθ·(N−N0)        (along the grid's "east" axis)
 *   v =  sinθ·(E−E0) + cosθ·(N−N0)        (along the grid's "north" axis)
 * i.e. E = E0 + u·cosθ + v·sinθ,  N = N0 − u·sinθ + v·cosθ.
 * col grows east, row grows north (for θ = 0).
 *
 * Point placement ("fdb-random-grid-v1"): for each sampled cell, a mulberry32
 * stream seeded with cellSeed(grid.seed, col, row) draws (u, v) uniformly in the
 * cell, two draws per attempt, until one falls inside the (edge-buffered) sample
 * area. Because each cell has its own stream, any one cell's point can be
 * regenerated without the others.
 */
import proj4 from "proj4";
import {
  area as polygonArea, bufferPolygon, destination, newSeed, seededRandom, GeoToolError, MAX_POINTS,
  type AreaGeometry, type LabeledPoint, type LatLng, type Ring,
} from "@/lib/geo-tools";

export const GRID_ALGORITHM = "fdb-random-grid-v1";
export const SQ_M_PER_ACRE = 4046.8564224;
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const MAX_CELLS_SCANNED = 400_000;
export const MAX_GRIDS = 20;

export interface GridDef {
  crs: string;
  origin_x: number;
  origin_y: number;
  cell_size_m: number;
  rotation_deg: number;
  seed: number;
}

/** A grid as stored on a draft / in Sampling_Grids. `key` links draft points to it (G1, G2…). */
export interface GridRecord extends GridDef {
  key: string;
  label: string;
  origin_lat: number;
  origin_lng: number;
  method: "random_in_cell";
  params: Record<string, unknown>;
}

// ── CRS ──────────────────────────────────────────────────────────────────────

/** WGS84 / UTM EPSG code for a position (standard 6° zones; no Norway/Svalbard exceptions). */
export function utmEpsg(p: LatLng): string {
  const zone = Math.min(60, Math.max(1, Math.floor((p.lng + 180) / 6) + 1));
  return `EPSG:${p.lat >= 0 ? 326 : 327}${String(zone).padStart(2, "0")}`;
}

const UTM_RE = /^EPSG:32([67])(\d\d)$/;
export function isUtmCrs(crs: string): boolean {
  const m = UTM_RE.exec(crs);
  return !!m && +m[2] >= 1 && +m[2] <= 60;
}

const converters = new Map<string, proj4.Converter>();
function converter(crs: string): proj4.Converter {
  const m = UTM_RE.exec(crs);
  if (!m || +m[2] < 1 || +m[2] > 60) throw new GeoToolError(`crs must be a WGS84 / UTM code like EPSG:32618 (got ${crs})`);
  let c = converters.get(crs);
  if (!c) {
    c = proj4("EPSG:4326", `+proj=utm +zone=${+m[2]}${m[1] === "7" ? " +south" : ""} +datum=WGS84 +units=m +no_defs`);
    converters.set(crs, c);
  }
  return c;
}
export const toCrs = (crs: string, p: LatLng): [number, number] => converter(crs).forward([p.lng, p.lat]) as [number, number];
export function fromCrs(crs: string, x: number, y: number): LatLng {
  const [lng, lat] = converter(crs).inverse([x, y]) as [number, number];
  return { lat, lng };
}

/** Grid bearing of true north at p (degrees, clockwise from grid north) — the meridian convergence. */
export function convergence(crs: string, p: LatLng): number {
  const [x0, y0] = toCrs(crs, p);
  const [x1, y1] = toCrs(crs, destination(p, 0, 100));
  return Math.atan2(x1 - x0, y1 - y0) * DEG;
}

// ── grid frame ───────────────────────────────────────────────────────────────

/** CRS (E, N) → grid (u, v), metres from the origin along the grid axes. */
function toGridUV(g: GridDef, e: number, n: number): [number, number] {
  const t = g.rotation_deg * RAD, c = Math.cos(t), s = Math.sin(t);
  const de = e - g.origin_x, dn = n - g.origin_y;
  return [c * de - s * dn, s * de + c * dn];
}
function fromGridUV(g: GridDef, u: number, v: number): [number, number] {
  const t = g.rotation_deg * RAD, c = Math.cos(t), s = Math.sin(t);
  return [g.origin_x + u * c + v * s, g.origin_y - u * s + v * c];
}

/** Which cell a lat/lng falls in. */
export function cellOf(g: GridDef, p: LatLng): { col: number; row: number; u: number; v: number } {
  const [u, v] = toGridUV(g, ...toCrs(g.crs, p));
  return { col: Math.floor(u / g.cell_size_m), row: Math.floor(v / g.cell_size_m), u, v };
}

/** The cell's square as a GeoJSON [lng, lat] ring (closed). */
export function cellRing(g: GridDef, col: number, row: number): Ring {
  const s = g.cell_size_m;
  const ring = ([[col, row], [col + 1, row], [col + 1, row + 1], [col, row + 1], [col, row]] as const).map(([i, j]) => {
    const ll = fromCrs(g.crs, ...fromGridUV(g, i * s, j * s));
    return [ll.lng, ll.lat] as [number, number];
  });
  return ring;
}

/** Independent PRNG seed for one cell, so any cell can be regenerated alone. */
export function cellSeed(seed: number, col: number, row: number): number {
  let h = (Math.floor(seed) >>> 0) ^ 0x85ebca6b;
  for (const k of [col, row]) {
    h = Math.imul(h ^ (k | 0), 0xcc9e2d51);
    h = (h << 15) | (h >>> 17);
    h = Math.imul(h, 0x1b873593) ^ 0xe6546b64;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}

// ── polygon clipping in the grid frame ───────────────────────────────────────

type UV = [number, number];
interface UVPolygon { rings: UV[][]; bbox: [number, number, number, number] }

function ringArea(r: UV[]): number {
  let s = 0;
  for (let i = 0, n = r.length; i < n; i++) {
    const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % n];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

/** Sutherland–Hodgman clip of a ring against an axis-aligned rectangle. */
function clipRect(ring: UV[], u0: number, v0: number, u1: number, v1: number): UV[] {
  let out = ring;
  const edges: [(p: UV) => boolean, (a: UV, b: UV) => UV][] = [
    [(p) => p[0] >= u0, (a, b) => [u0, a[1] + ((b[1] - a[1]) * (u0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= u1, (a, b) => [u1, a[1] + ((b[1] - a[1]) * (u1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= v0, (a, b) => [a[0] + ((b[0] - a[0]) * (v0 - a[1])) / (b[1] - a[1]), v0]],
    [(p) => p[1] <= v1, (a, b) => [a[0] + ((b[0] - a[0]) * (v1 - a[1])) / (b[1] - a[1]), v1]],
  ];
  for (const [inside, cross] of edges) {
    if (!out.length) break;
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i], prev = input[(i + input.length - 1) % input.length];
      const ci = inside(cur), pi = inside(prev);
      if (ci) {
        if (!pi) out.push(cross(prev, cur));
        out.push(cur);
      } else if (pi) {
        out.push(cross(prev, cur));
      }
    }
  }
  return out;
}

function inRingUV(x: number, y: number, ring: UV[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inPolyUV = (x: number, y: number, p: UVPolygon) =>
  x >= p.bbox[0] && x <= p.bbox[2] && y >= p.bbox[1] && y <= p.bbox[3] &&
  inRingUV(x, y, p.rings[0]) && !p.rings.slice(1).some((h) => inRingUV(x, y, h));

function cellAreaIn(polys: UVPolygon[], u0: number, v0: number, u1: number, v1: number): number {
  let a = 0;
  for (const p of polys) {
    if (p.bbox[2] <= u0 || p.bbox[0] >= u1 || p.bbox[3] <= v0 || p.bbox[1] >= v1) continue;
    a += ringArea(clipRect(p.rings[0], u0, v0, u1, v1));
    for (const h of p.rings.slice(1)) a -= ringArea(clipRect(h, u0, v0, u1, v1));
  }
  return Math.max(0, a);
}

function polygonsOf(g: AreaGeometry): Ring[][] {
  return g.type === "Polygon" ? [g.coordinates] : g.coordinates;
}

function toUV(g: GridDef, area: AreaGeometry): UVPolygon[] {
  return polygonsOf(area).filter((r) => r.length && r[0].length >= 4).map((rings) => {
    const uv = rings.map((ring) => {
      const pts = ring.map(([lng, lat]) => toGridUV(g, ...toCrs(g.crs, { lat, lng })));
      if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
      return pts;
    });
    let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
    for (const [u, v] of uv[0]) {
      minU = Math.min(minU, u); maxU = Math.max(maxU, u);
      minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    return { rings: uv, bbox: [minU, minV, maxU, maxV] as [number, number, number, number] };
  });
}

// ── random grid sampling ─────────────────────────────────────────────────────

export interface SamplePolygon {
  /** Label used in point labels/meta and in the grid record (e.g. the field name). */
  label: string;
  /** How the polygon was referenced, stored on the grid record for traceability. */
  ref: Record<string, unknown>;
  polygon: AreaGeometry;
  /** True-north bearing of the grid's "up" axis for this polygon (rows / planting direction). */
  rotationDeg?: number;
}

export type GridSizing = { cellSizeM: number } | { perAcre: number } | { total: number; exact?: boolean };
export type GridGrouping = "auto" | "shared" | "per_polygon";

export interface RandomGridOptions {
  edgeBufferM?: number;
  /** A cell is sampled when at least this fraction of it lies inside the sample area (default 0.5). */
  minCellFraction?: number;
  seed?: number;
  labelPrefix?: string;
  grouping?: GridGrouping;
  /** Default true-north rotation for polygons without their own (undefined = align to UTM grid north). */
  rotationDeg?: number;
}

interface Group {
  members: { sp: SamplePolygon; area: AreaGeometry }[];
  crs: string;
  rotationTrue: number | undefined;
}

interface PreparedGroup extends Group {
  grid: GridDef;
  polys: UVPolygon[];
  extent: [number, number, number, number]; // u/v bbox of the sample area
  convergenceDeg: number;
  center: LatLng;
}

function bboxCenter(areas: AreaGeometry[]): LatLng {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const a of areas) for (const rings of polygonsOf(a)) for (const [x, y] of rings[0] ?? []) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) throw new GeoToolError("polygon has no coordinates");
  return { lat: (minY + maxY) / 2, lng: (minX + maxX) / 2 };
}

/**
 * Prepare one group: its CRS rotation (true-north bearing + convergence) and an
 * origin at the SW corner of the sample area's extent in the grid frame, floored
 * to whole metres so the record stays readable. The origin doesn't depend on
 * the cell size, so a search over cell sizes keeps one origin.
 */
function prepare(group: Group, seed: number): PreparedGroup {
  const center = bboxCenter(group.members.map((m) => m.area));
  const conv = convergence(group.crs, center);
  const rotation = group.rotationTrue == null ? 0 : ((((group.rotationTrue + conv) % 360) + 540) % 360) - 180;
  const rotation_deg = Math.round(rotation * 1e6) / 1e6;
  const base: GridDef = { crs: group.crs, origin_x: 0, origin_y: 0, cell_size_m: 1, rotation_deg, seed };
  let minU = Infinity, minV = Infinity;
  for (const m of group.members) for (const p of toUV(base, m.area)) {
    minU = Math.min(minU, p.bbox[0]);
    minV = Math.min(minV, p.bbox[1]);
  }
  const [ox, oy] = fromGridUV(base, Math.floor(minU), Math.floor(minV));
  const grid: GridDef = rotation_deg === 0
    ? { ...base, origin_x: Math.floor(minU), origin_y: Math.floor(minV) }
    : { ...base, origin_x: Math.round(ox * 1000) / 1000, origin_y: Math.round(oy * 1000) / 1000 };
  const polys = group.members.flatMap((m) => toUV(grid, m.area));
  const extent: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of polys) {
    extent[0] = Math.min(extent[0], p.bbox[0]); extent[1] = Math.min(extent[1], p.bbox[1]);
    extent[2] = Math.max(extent[2], p.bbox[2]); extent[3] = Math.max(extent[3], p.bbox[3]);
  }
  return { ...group, grid, polys, extent, convergenceDeg: conv, center };
}

/** Cells of a prepared group with ≥ minFraction of their area inside the sample area. */
function qualifyingCells(g: PreparedGroup, size: number, minFraction: number): { col: number; row: number; inside_m2: number }[] {
  const c0 = Math.floor(g.extent[0] / size), c1 = Math.floor(g.extent[2] / size);
  const r0 = Math.floor(g.extent[1] / size), r1 = Math.floor(g.extent[3] / size);
  if ((c1 - c0 + 1) * (r1 - r0 + 1) > MAX_CELLS_SCANNED) throw new GeoToolError("the cells are too small for this area — use fewer points or a larger cell size");
  const out: { col: number; row: number; inside_m2: number }[] = [];
  const full = size * size;
  for (let row = r1; row >= r0; row--) {
    for (let col = c0; col <= c1; col++) {
      const a = cellAreaIn(g.polys, col * size, row * size, (col + 1) * size, (row + 1) * size);
      if (a > 0 && a >= minFraction * full - 1e-9) out.push({ col, row, inside_m2: a });
    }
  }
  return out;
}

function groupPolygons(polys: { sp: SamplePolygon; area: AreaGeometry }[], grouping: GridGrouping, defaultRotation?: number): Group[] {
  const rot = (m: { sp: SamplePolygon }) => m.sp.rotationDeg ?? defaultRotation;
  if (grouping === "per_polygon") {
    return polys.map((m) => ({ members: [m], crs: utmEpsg(bboxCenter([m.area])), rotationTrue: rot(m) }));
  }
  if (grouping === "shared") {
    const r = new Set(polys.map((m) => rot(m) ?? "none"));
    if (r.size > 1) throw new GeoToolError("grouping 'shared' needs one rotation for every polygon — drop the per-polygon rotations or use 'auto'");
    return [{ members: polys, crs: utmEpsg(bboxCenter(polys.map((m) => m.area))), rotationTrue: rot(polys[0]) }];
  }
  // auto: one grid per (UTM zone, rotation); everything that can share a lattice does.
  const groups = new Map<string, Group>();
  for (const m of polys) {
    const crs = utmEpsg(bboxCenter([m.area]));
    const r = rot(m);
    const k = `${crs}|${r ?? "none"}`;
    if (!groups.has(k)) groups.set(k, { members: [], crs, rotationTrue: r });
    groups.get(k)!.members.push(m);
  }
  return [...groups.values()];
}

export interface RandomGridResult {
  grids: GridRecord[];
  points: LabeledPoint[];
  seed: number;
  cell_size_m: number;
  summary: {
    grids: number;
    points: number;
    sample_area_m2: number;
    sample_area_ac: number;
    points_per_acre: number;
    target?: number;
    dropped_cells?: number;
  };
  warnings: string[];
}

/**
 * Randomized grid sampling: one random point per grid cell over the polygons.
 * Sizing: a cell size, a density (points per acre → cell = √(acre / density)),
 * or a total (the cell size is searched so the number of sampled cells meets
 * the total; with `exact` (default) any surplus cells are dropped at random,
 * seeded, and listed on the grid record).
 */
export function randomGridSample(polygons: SamplePolygon[], sizing: GridSizing, opts: RandomGridOptions = {}): RandomGridResult {
  if (!polygons.length) throw new GeoToolError("no polygons given");
  if (polygons.length > 200) throw new GeoToolError("at most 200 polygons");
  const minFraction = opts.minCellFraction ?? 0.5;
  if (!Number.isFinite(minFraction) || minFraction < 0.01 || minFraction > 1) throw new GeoToolError("min_cell_fraction must be between 0.01 and 1");
  const edge = opts.edgeBufferM ?? 0;
  if (!Number.isFinite(edge) || edge < 0) throw new GeoToolError("edge_buffer_m must be ≥ 0");
  const seed = opts.seed ?? newSeed();
  if (!Number.isInteger(seed) || seed < 0 || seed >= 2 ** 31) throw new GeoToolError("seed must be a whole number from 0 to 2147483647");
  for (const p of polygons) {
    if (p.rotationDeg != null && !Number.isFinite(p.rotationDeg)) throw new GeoToolError("rotation_deg must be a number");
  }
  const warnings: string[] = [];

  const sampled = polygons.flatMap((sp) => {
    const a = edge ? bufferPolygon(sp.polygon, -edge) : sp.polygon;
    if (!a) {
      warnings.push(`a ${edge} m edge buffer leaves nothing of ${sp.label} — skipped`);
      return [];
    }
    return [{ sp, area: a }];
  });
  if (!sampled.length) throw new GeoToolError(`a ${edge} m edge buffer leaves nothing to sample`);
  const totalArea = sampled.reduce((s, m) => s + polygonArea(m.area), 0);

  const rand = seededRandom(seed);
  const groups = groupPolygons(sampled, opts.grouping ?? "auto", opts.rotationDeg);
  if (groups.length > MAX_GRIDS) throw new GeoToolError(`more than ${MAX_GRIDS} grids — use grouping 'shared' or fewer rotations`);
  const prepared = groups.map(() => Math.floor(rand() * 2 ** 31)).map((gridSeed, i) => prepare(groups[i], gridSeed));

  const cellsAt = (size: number) => prepared.map((g) => qualifyingCells(g, size, minFraction));
  const count = (cells: ReturnType<typeof cellsAt>) => cells.reduce((s, c) => s + c.length, 0);

  let size: number;
  let cells: ReturnType<typeof cellsAt>;
  let target: number | undefined;
  if ("cellSizeM" in sizing) {
    size = sizing.cellSizeM;
    if (!Number.isFinite(size) || size < 1 || size > 5000) throw new GeoToolError("cell_size_m must be between 1 and 5000");
    cells = cellsAt(size);
  } else if ("perAcre" in sizing) {
    if (!Number.isFinite(sizing.perAcre) || sizing.perAcre <= 0) throw new GeoToolError("per_acre must be > 0");
    size = Math.round(Math.sqrt(SQ_M_PER_ACRE / sizing.perAcre) * 100) / 100;
    if (size < 1) throw new GeoToolError("per_acre is too dense (cells under 1 m)");
    cells = cellsAt(size);
  } else {
    target = sizing.total;
    if (!Number.isInteger(target) || target < 1 || target > MAX_POINTS) throw new GeoToolError(`total must be 1–${MAX_POINTS}`);
    // Largest cell size whose sampled-cell count still reaches the target.
    const s0 = Math.sqrt(totalArea / target);
    let lo = s0 / 4, hi = s0 * 4;
    if (count(cellsAt(lo)) < target) {
      lo = Math.max(1, s0 / 20);
      if (count(cellsAt(lo)) < target) throw new GeoToolError(`can't fit ${target} cells in this area — lower total or min_cell_fraction`);
    }
    for (let k = 0; k < 40 && hi - lo > 0.005; k++) {
      const mid = (lo + hi) / 2;
      if (count(cellsAt(mid)) >= target) lo = mid;
      else hi = mid;
    }
    size = Math.floor(lo * 100) / 100 || lo;
    cells = cellsAt(size);
    if (count(cells) < target) {
      size = lo;
      cells = cellsAt(size);
    }
  }

  const dropped = prepared.map(() => [] as [number, number][]);
  const n = count(cells);
  if (n > MAX_POINTS) throw new GeoToolError(`${n} cells — more than ${MAX_POINTS} points; use a larger cell size or lower density`);
  if (!n) throw new GeoToolError("no grid cell is inside the sample area — use a smaller cell size or a lower min_cell_fraction");
  if (target != null && n > target && (sizing as { exact?: boolean }).exact !== false) {
    // Drop the surplus at random (seeded by the request seed), across all grids.
    const all = cells.flatMap((cs, gi) => cs.map((c) => ({ gi, c })));
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    const drop = new Set(all.slice(target).map((x) => x.c));
    cells = cells.map((cs, gi) => cs.filter((c) => {
      if (!drop.has(c)) return true;
      dropped[gi].push([c.col, c.row]);
      return false;
    }));
  }

  const prefix = opts.labelPrefix ? `${opts.labelPrefix}-` : "RG-";
  const points: LabeledPoint[] = [];
  const grids: GridRecord[] = prepared.map((g, gi) => {
    const grid: GridDef = { ...g.grid, cell_size_m: size };
    const key = `G${gi + 1}`;
    const memberPolys = g.members.map((m) => toUV(grid, m.area));
    let placedHere = 0;
    for (const c of cells[gi]) {
      const r = seededRandom(cellSeed(grid.seed, c.col, c.row));
      let hit: [number, number] | null = null;
      for (let attempt = 0; attempt < 2000 && !hit; attempt++) {
        const u = (c.col + r()) * size, v = (c.row + r()) * size;
        if (g.polys.some((p) => inPolyUV(u, v, p))) hit = [u, v];
      }
      if (!hit) {
        warnings.push(`${key} cell ${c.col},${c.row}: no point found inside the area — skipped`);
        continue;
      }
      const ll = fromCrs(grid.crs, ...fromGridUV(grid, hit[0], hit[1]));
      const mi = memberPolys.findIndex((ps) => ps.some((p) => inPolyUV(hit![0], hit![1], p)));
      const member = mi >= 0 ? g.members[mi] : undefined;
      placedHere++;
      points.push({
        ...ll,
        label: `${prefix}${points.length + 1}`,
        meta: { grid: key, col: c.col, row: c.row, ...(member ? { polygon: member.sp.label } : {}) },
      });
    }
    const originLL = fromCrs(grid.crs, grid.origin_x, grid.origin_y);
    const groupArea = g.members.reduce((s, m) => s + polygonArea(m.area), 0);
    return {
      key,
      label: `${opts.labelPrefix ?? "Random grid"} ${key} · ${size} m`,
      ...grid,
      origin_lat: Math.round(originLL.lat * 1e9) / 1e9,
      origin_lng: Math.round(originLL.lng * 1e9) / 1e9,
      method: "random_in_cell",
      params: {
        algorithm: GRID_ALGORITHM,
        polygons: g.members.map((m) => ({ ...m.sp.ref, label: m.sp.label })),
        rotation_true_deg: g.rotationTrue ?? null,
        convergence_deg: Math.round(g.convergenceDeg * 1e6) / 1e6,
        edge_buffer_m: edge,
        min_cell_fraction: minFraction,
        sizing: "cellSizeM" in sizing ? { cell_size_m: sizing.cellSizeM } : "perAcre" in sizing ? { per_acre: sizing.perAcre } : { total: sizing.total, exact: sizing.exact !== false },
        request_seed: seed,
        sample_area_m2: Math.round(groupArea),
        cells_sampled: placedHere,
        ...(dropped[gi].length ? { dropped_cells: dropped[gi] } : {}),
      },
    };
  });

  if (target != null && points.length !== target) {
    warnings.push(`placed ${points.length} points for a target of ${target} — cell counts jump in steps at this size; set exact=true (default) to trim, or adjust min_cell_fraction`);
  }
  const acres = totalArea / SQ_M_PER_ACRE;
  return {
    grids,
    points,
    seed,
    cell_size_m: size,
    summary: {
      grids: grids.length,
      points: points.length,
      sample_area_m2: Math.round(totalArea),
      sample_area_ac: Math.round(acres * 100) / 100,
      points_per_acre: Math.round((points.length / acres) * 1000) / 1000,
      ...(target != null ? { target } : {}),
      ...(dropped.some((d) => d.length) ? { dropped_cells: dropped.reduce((s, d) => s + d.length, 0) } : {}),
    },
    warnings,
  };
}

/**
 * Server-side check that a drafted grid is a well-formed record and that a
 * point claiming (grid, col, row) really lies in that cell — so a stored grid
 * always truthfully describes its points.
 */
export function validateGridDef(g: Record<string, unknown>): string | null {
  if (typeof g.crs !== "string" || !isUtmCrs(g.crs)) return "crs must be a WGS84 / UTM code like EPSG:32618";
  for (const k of ["origin_x", "origin_y", "cell_size_m", "rotation_deg", "seed"] as const) {
    if (typeof g[k] !== "number" || !Number.isFinite(g[k] as number)) return `${k} must be a number`;
  }
  if ((g.cell_size_m as number) < 1 || (g.cell_size_m as number) > 5000) return "cell_size_m must be between 1 and 5000";
  if (Math.abs(g.rotation_deg as number) > 360) return "rotation_deg must be within ±360";
  if (!Number.isInteger(g.seed) || (g.seed as number) < 0 || (g.seed as number) >= 2 ** 31) return "seed must be a whole number from 0 to 2147483647";
  if (Math.abs(g.origin_x as number) > 2e6 || Math.abs(g.origin_y as number) > 1e7) return "origin is outside the UTM zone";
  return null;
}

export function pointInCell(g: GridDef, p: LatLng, col: number, row: number): boolean {
  const c = cellOf(g, p);
  const tol = 1e-3; // 1 mm
  const s = g.cell_size_m;
  return c.u >= col * s - tol && c.u <= (col + 1) * s + tol && c.v >= row * s - tol && c.v <= (row + 1) * s + tol;
}
