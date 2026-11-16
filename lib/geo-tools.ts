/**
 * Deterministic geometry tools for sampling maps (docs/cartographer-agent-plan.md §4).
 *
 * One implementation shared by the sampling-map editor's quick actions, the
 * server, and (later) agents via /api/agent/compute/geo/*: agents plan, these
 * functions compute. Pure — no DB, no network, no randomness except a seeded
 * PRNG — so every result is reproducible from its parameters.
 *
 * Conventions: coordinates are {lat, lng} in WGS84 degrees; GeoJSON positions
 * are [lng, lat]; distances in metres; bearings in degrees clockwise from true
 * north. Point offsets use Vincenty's direct formula on the WGS84 ellipsoid
 * (sub-millimetre at field scale); area-filling tools work in a local
 * east/north metre frame centred on the polygon, which is accurate to well under
 * 0.1% across a few kilometres.
 */
import { bufferGeojsonString } from "@/lib/geo";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface LabeledPoint extends LatLng {
  label: string;
  /** Extra provenance a caller may store with the point (stratum, transect index…). */
  meta?: Record<string, string | number>;
}

export type Ring = [number, number][]; // [lng, lat]
export interface PolygonGeometry {
  type: "Polygon";
  coordinates: Ring[];
}
export interface MultiPolygonGeometry {
  type: "MultiPolygon";
  coordinates: Ring[][];
}
export type AreaGeometry = PolygonGeometry | MultiPolygonGeometry;

export class GeoToolError extends Error {}

// ── WGS84 + Vincenty ─────────────────────────────────────────────────────────

const A = 6378137.0;
const F = 1 / 298.257223563;
const B = A * (1 - F);
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

const norm360 = (d: number) => ((d % 360) + 360) % 360;
const normLng = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

function checkLatLng(p: LatLng, name = "point") {
  if (!Number.isFinite(p?.lat) || !Number.isFinite(p?.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) {
    throw new GeoToolError(`${name} must have lat in [-90, 90] and lng in [-180, 180]`);
  }
}

/** The point `distanceM` metres from `from` along initial bearing `bearingDeg` (Vincenty direct). */
export function destination(from: LatLng, bearingDeg: number, distanceM: number): LatLng {
  checkLatLng(from, "from");
  if (!Number.isFinite(bearingDeg) || !Number.isFinite(distanceM)) throw new GeoToolError("bearing and distance must be numbers");
  if (distanceM === 0) return { lat: from.lat, lng: from.lng };
  const alpha1 = bearingDeg * RAD;
  const sinA1 = Math.sin(alpha1);
  const cosA1 = Math.cos(alpha1);
  const tanU1 = (1 - F) * Math.tan(from.lat * RAD);
  const cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1);
  const sinU1 = tanU1 * cosU1;
  const sigma1 = Math.atan2(tanU1, cosA1);
  const sinAlpha = cosU1 * sinA1;
  const cosSqAlpha = 1 - sinAlpha * sinAlpha;
  const uSq = (cosSqAlpha * (A * A - B * B)) / (B * B);
  const bigA = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const bigB = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));

  let sigma = distanceM / (B * bigA);
  let sigmaP: number;
  let cos2SigmaM = 0;
  let sinSigma = 0;
  let cosSigma = 0;
  let iter = 0;
  do {
    cos2SigmaM = Math.cos(2 * sigma1 + sigma);
    sinSigma = Math.sin(sigma);
    cosSigma = Math.cos(sigma);
    const deltaSigma =
      bigB * sinSigma *
      (cos2SigmaM + (bigB / 4) * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
        (bigB / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
    sigmaP = sigma;
    sigma = distanceM / (B * bigA) + deltaSigma;
  } while (Math.abs(sigma - sigmaP) > 1e-12 && ++iter < 200);

  const tmp = sinU1 * sinSigma - cosU1 * cosSigma * cosA1;
  const lat2 = Math.atan2(sinU1 * cosSigma + cosU1 * sinSigma * cosA1, (1 - F) * Math.sqrt(sinAlpha * sinAlpha + tmp * tmp));
  const lambda = Math.atan2(sinSigma * sinA1, cosU1 * cosSigma - sinU1 * sinSigma * cosA1);
  const C = (F / 16) * cosSqAlpha * (4 + F * (4 - 3 * cosSqAlpha));
  const L = lambda - (1 - C) * F * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
  return { lat: lat2 * DEG, lng: normLng(from.lng + L * DEG) };
}

/** Distance (m) and initial bearing (deg) from `a` to `b` (Vincenty inverse). */
export function measure(a: LatLng, b: LatLng): { distanceM: number; bearingDeg: number } {
  checkLatLng(a, "a");
  checkLatLng(b, "b");
  const L = (b.lng - a.lng) * RAD;
  const U1 = Math.atan((1 - F) * Math.tan(a.lat * RAD));
  const U2 = Math.atan((1 - F) * Math.tan(b.lat * RAD));
  const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1), sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);
  let lambda = L;
  let lambdaP: number;
  let iter = 0;
  let sinSigma = 0, cosSigma = 0, sigma = 0, cosSqAlpha = 0, cos2SigmaM = 0, sinLambda = 0, cosLambda = 0;
  do {
    sinLambda = Math.sin(lambda);
    cosLambda = Math.cos(lambda);
    sinSigma = Math.sqrt((cosU2 * sinLambda) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2);
    if (sinSigma === 0) return { distanceM: 0, bearingDeg: 0 };
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha : 0;
    const C = (F / 16) * cosSqAlpha * (4 + F * (4 - 3 * cosSqAlpha));
    lambdaP = lambda;
    lambda = L + (1 - C) * F * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
  } while (Math.abs(lambda - lambdaP) > 1e-12 && ++iter < 200);
  const uSq = (cosSqAlpha * (A * A - B * B)) / (B * B);
  const bigA = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const bigB = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma =
    bigB * sinSigma *
    (cos2SigmaM + (bigB / 4) * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
      (bigB / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
  const distanceM = B * bigA * (sigma - deltaSigma);
  const bearingDeg = norm360(Math.atan2(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) * DEG);
  return { distanceM, bearingDeg };
}

// ── seeded PRNG ──────────────────────────────────────────────────────────────

/** mulberry32: small, fast, good enough for sample placement; same seed → same layout. */
export function seededRandom(seed: number): () => number {
  let s = (Math.floor(seed) >>> 0) || 0x9e3779b9;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

// ── geometry parsing / local frame ───────────────────────────────────────────

/** Accepts a Polygon/MultiPolygon geometry, Feature, or JSON string of either. */
export function toAreaGeometry(input: unknown): AreaGeometry {
  let g = input;
  if (typeof g === "string") {
    try {
      g = JSON.parse(g);
    } catch {
      throw new GeoToolError("polygon is not valid JSON");
    }
  }
  if (g && typeof g === "object" && (g as { type?: string }).type === "Feature") g = (g as { geometry: unknown }).geometry;
  const t = (g as { type?: string })?.type;
  if (t !== "Polygon" && t !== "MultiPolygon") throw new GeoToolError("polygon must be a GeoJSON Polygon or MultiPolygon");
  return g as AreaGeometry;
}

function polygonsOf(g: AreaGeometry): Ring[][] {
  return g.type === "Polygon" ? [g.coordinates] : g.coordinates;
}

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Point-in-(Multi)Polygon that respects holes. */
export function inside(p: LatLng, polygon: AreaGeometry): boolean {
  return polygonsOf(polygon).some(
    (rings) => rings.length > 0 && inRing(p.lng, p.lat, rings[0]) && !rings.slice(1).some((h) => inRing(p.lng, p.lat, h)),
  );
}

function boundsOf(g: AreaGeometry): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const rings of polygonsOf(g)) for (const [x, y] of rings[0] ?? []) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) throw new GeoToolError("polygon has no coordinates");
  return [minX, minY, maxX, maxY];
}

/** East/north metres around an origin, using WGS84 meridional / prime-vertical radii. */
interface LocalFrame {
  toLocal(p: LatLng): [number, number];
  fromLocal(x: number, y: number): LatLng;
}

function localFrame(origin: LatLng): LocalFrame {
  const phi = origin.lat * RAD;
  const e2 = F * (2 - F);
  const w = Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const mPerDegLat = ((A * (1 - e2)) / (w * w * w)) * RAD; // meridional radius
  const mPerDegLng = (A / w) * Math.cos(phi) * RAD; // prime vertical × cos φ
  return {
    toLocal: (p) => [(p.lng - origin.lng) * mPerDegLng, (p.lat - origin.lat) * mPerDegLat],
    fromLocal: (x, y) => ({ lat: origin.lat + y / mPerDegLat, lng: origin.lng + x / mPerDegLng }),
  };
}

/** Area in square metres (local-frame shoelace, holes subtracted). */
export function area(polygon: AreaGeometry): number {
  const [minX, minY, maxX, maxY] = boundsOf(polygon);
  const frame = localFrame({ lat: (minY + maxY) / 2, lng: (minX + maxX) / 2 });
  const ringArea = (ring: Ring) => {
    let s = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = frame.toLocal({ lng: ring[i][0], lat: ring[i][1] });
      const [x2, y2] = frame.toLocal({ lng: ring[(i + 1) % ring.length][0], lat: ring[(i + 1) % ring.length][1] });
      s += x1 * y2 - x2 * y1;
    }
    return Math.abs(s) / 2;
  };
  return polygonsOf(polygon).reduce(
    (sum, rings) => sum + Math.max(0, ringArea(rings[0] ?? []) - rings.slice(1).reduce((h, r) => h + ringArea(r), 0)),
    0,
  );
}

/** Erode (negative) or grow (positive) a polygon in metres; null if it erodes away. */
export function bufferPolygon(polygon: AreaGeometry, distanceM: number): AreaGeometry | null {
  if (!distanceM) return polygon;
  const out = bufferGeojsonString(JSON.stringify(polygon), distanceM);
  return out ? (JSON.parse(out) as AreaGeometry) : null;
}

/** Inward edge buffer for area-filling tools: edgeBufferM ≥ 0 erodes the polygon. */
function sampleArea(polygon: AreaGeometry, edgeBufferM: number): AreaGeometry {
  if (!Number.isFinite(edgeBufferM) || edgeBufferM < 0) throw new GeoToolError("edge_buffer_m must be ≥ 0");
  const eroded = bufferPolygon(polygon, -edgeBufferM);
  if (!eroded) throw new GeoToolError(`a ${edgeBufferM} m edge buffer leaves nothing of the polygon`);
  return eroded;
}

export const MAX_POINTS = 2000;

// ── patterns around a point ──────────────────────────────────────────────────

const COMPASS8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compass = (bearing: number) => COMPASS8[Math.round(norm360(bearing) / 45) % 8];

export type PointPattern = "square_corners" | "cross" | "ring";

/**
 * Points around a centre.
 *  - square_corners: corners of a square with side `sizeM`, sides aligned N–S/E–W
 *    when rotation is 0 (so corners are NE/SE/SW/NW at sizeM/√2).
 *  - cross: four points `sizeM` from the centre at N/E/S/W (rotated).
 *  - ring: `count` points evenly spaced on a circle of radius `sizeM`, first at
 *    the rotation bearing.
 * Labels are compass directions (or R1…Rn), prefixed by `labelPrefix` if given.
 */
export function pointsAround(
  center: LatLng,
  pattern: PointPattern,
  sizeM: number,
  opts: { rotationDeg?: number; count?: number; includeCenter?: boolean; labelPrefix?: string } = {},
): LabeledPoint[] {
  checkLatLng(center, "center");
  if (!Number.isFinite(sizeM) || sizeM <= 0 || sizeM > 10_000) throw new GeoToolError("size_m must be between 0 and 10000");
  const rot = opts.rotationDeg ?? 0;
  const prefix = opts.labelPrefix ? `${opts.labelPrefix}-` : "";
  let spokes: { bearing: number; dist: number; label: string }[];
  if (pattern === "square_corners") {
    spokes = [45, 135, 225, 315].map((b) => ({ bearing: b + rot, dist: sizeM / Math.SQRT2, label: compass(b + rot) }));
  } else if (pattern === "cross") {
    spokes = [0, 90, 180, 270].map((b) => ({ bearing: b + rot, dist: sizeM, label: compass(b + rot) }));
  } else if (pattern === "ring") {
    const n = opts.count ?? 8;
    if (!Number.isInteger(n) || n < 3 || n > 360) throw new GeoToolError("count must be an integer from 3 to 360");
    spokes = Array.from({ length: n }, (_, i) => ({ bearing: rot + (360 * i) / n, dist: sizeM, label: `R${i + 1}` }));
  } else {
    throw new GeoToolError(`unknown pattern ${String(pattern)}`);
  }
  const out: LabeledPoint[] = spokes.map((s) => ({
    ...destination(center, s.bearing, s.dist),
    label: prefix + s.label,
    meta: { bearing_deg: Math.round(norm360(s.bearing) * 1000) / 1000, distance_m: Math.round(s.dist * 1000) / 1000 },
  }));
  if (opts.includeCenter) out.unshift({ ...center, label: prefix + "C", meta: { bearing_deg: 0, distance_m: 0 } });
  return out;
}

export type ShapeKind = "square" | "rectangle" | "circle";

/** A polygon centred on a point. square: side sizeM; rectangle: sizeM wide (E–W) × heightM tall (N–S); circle: radius sizeM. */
export function shapeAround(
  center: LatLng,
  shape: ShapeKind,
  sizeM: number,
  opts: { heightM?: number; rotationDeg?: number; segments?: number } = {},
): PolygonGeometry {
  checkLatLng(center, "center");
  if (!Number.isFinite(sizeM) || sizeM <= 0 || sizeM > 10_000) throw new GeoToolError("size_m must be between 0 and 10000");
  const rot = opts.rotationDeg ?? 0;
  let verts: LatLng[];
  if (shape === "circle") {
    const n = Math.min(Math.max(opts.segments ?? 64, 8), 360);
    verts = Array.from({ length: n }, (_, i) => destination(center, (360 * i) / n, sizeM));
  } else {
    const w = sizeM;
    const h = shape === "rectangle" ? (opts.heightM ?? sizeM) : sizeM;
    if (!Number.isFinite(h) || h <= 0 || h > 10_000) throw new GeoToolError("height_m must be between 0 and 10000");
    // Corner offsets in the rotated local frame, then each one as an exact geodesic offset.
    verts = [
      [w / 2, h / 2], [w / 2, -h / 2], [-w / 2, -h / 2], [-w / 2, h / 2],
    ].map(([x, y]) => {
      const bearing = Math.atan2(x, y) * DEG + rot;
      return destination(center, bearing, Math.hypot(x, y));
    });
  }
  const ring: Ring = verts.map((v) => [v.lng, v.lat]);
  ring.push(ring[0]);
  return { type: "Polygon", coordinates: [ring] };
}

// ── area-filling tools ───────────────────────────────────────────────────────

/**
 * A square lattice `spacingM` apart over the polygon (after an inward edge
 * buffer), optionally rotated (e.g. to follow planting rows). The lattice is
 * anchored at the polygon's bbox centre so results don't depend on vertex order.
 */
export function gridInPolygon(
  polygonIn: AreaGeometry,
  spacingM: number,
  opts: { edgeBufferM?: number; rotationDeg?: number; maxPoints?: number; labelPrefix?: string } = {},
): LabeledPoint[] {
  if (!Number.isFinite(spacingM) || spacingM < 1) throw new GeoToolError("spacing_m must be at least 1");
  const polygon = sampleArea(polygonIn, opts.edgeBufferM ?? 0);
  const [minX, minY, maxX, maxY] = boundsOf(polygon);
  const origin = { lat: (minY + maxY) / 2, lng: (minX + maxX) / 2 };
  const frame = localFrame(origin);
  const [x0, y0] = frame.toLocal({ lat: minY, lng: minX });
  const [x1, y1] = frame.toLocal({ lat: maxY, lng: maxX });
  const half = Math.hypot(x1 - x0, y1 - y0) / 2 + spacingM; // covers the bbox under any rotation
  const rot = (opts.rotationDeg ?? 0) * RAD;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const max = Math.min(opts.maxPoints ?? MAX_POINTS, MAX_POINTS);
  const prefix = opts.labelPrefix ? `${opts.labelPrefix}-` : "G";
  const out: LabeledPoint[] = [];
  const steps = Math.ceil(half / spacingM);
  if ((2 * steps + 1) ** 2 > 4_000_000) throw new GeoToolError("spacing is too small for this polygon");
  for (let j = steps; j >= -steps; j--) {
    for (let i = -steps; i <= steps; i++) {
      const u = i * spacingM, v = j * spacingM;
      // rotate the lattice clockwise by rotationDeg (bearing convention)
      const x = u * cos + v * sin, y = -u * sin + v * cos;
      const p = frame.fromLocal(x, y);
      if (!inside(p, polygon)) continue;
      if (out.length >= max) throw new GeoToolError(`more than ${max} points — increase spacing_m`);
      out.push({ ...p, label: `${prefix}${out.length + 1}`, meta: { row: steps - j + 1, col: i + steps + 1 } });
    }
  }
  return out;
}

/** `count` uniformly random points in the polygon, at least `minSpacingM` apart. Seeded. */
export function randomInPolygon(
  polygonIn: AreaGeometry,
  count: number,
  opts: { minSpacingM?: number; edgeBufferM?: number; seed?: number; labelPrefix?: string; maxAttempts?: number } = {},
): { points: LabeledPoint[]; seed: number; shortfall: number } {
  if (!Number.isInteger(count) || count < 1 || count > MAX_POINTS) throw new GeoToolError(`count must be 1–${MAX_POINTS}`);
  const polygon = sampleArea(polygonIn, opts.edgeBufferM ?? 0);
  const seed = opts.seed ?? newSeed();
  const rand = seededRandom(seed);
  const [minX, minY, maxX, maxY] = boundsOf(polygon);
  const frame = localFrame({ lat: (minY + maxY) / 2, lng: (minX + maxX) / 2 });
  const minSpacing = opts.minSpacingM ?? 0;
  const prefix = opts.labelPrefix ? `${opts.labelPrefix}-` : "P";
  const accepted: { p: LatLng; xy: [number, number] }[] = [];
  const maxAttempts = opts.maxAttempts ?? Math.max(5000, count * 500);
  for (let attempt = 0; attempt < maxAttempts && accepted.length < count; attempt++) {
    const p = { lat: minY + rand() * (maxY - minY), lng: minX + rand() * (maxX - minX) };
    if (!inside(p, polygon)) continue;
    const xy = frame.toLocal(p);
    if (minSpacing > 0 && accepted.some((a) => Math.hypot(a.xy[0] - xy[0], a.xy[1] - xy[1]) < minSpacing)) continue;
    accepted.push({ p, xy });
  }
  return {
    points: accepted.map((a, i) => ({ ...a.p, label: `${prefix}${i + 1}` })),
    seed,
    shortfall: count - accepted.length,
  };
}

export interface Stratum {
  id: string | number;
  label: string;
  polygon: AreaGeometry;
}

/**
 * Stratified random sampling: points in each stratum, at least `minSpacingM`
 * apart *across* strata. Allocation:
 *  - { perStratum: n } — n in each stratum;
 *  - { total: n, mode: "proportional" } — by area (largest-remainder rounding,
 *    at least `minPerStratum`, default 1);
 *  - { total: n, mode: "equal" } — split evenly, remainder to the largest strata.
 */
export function stratifiedRandom(
  strata: Stratum[],
  allocation: { perStratum: number } | { total: number; mode: "proportional" | "equal"; minPerStratum?: number },
  opts: { minSpacingM?: number; edgeBufferM?: number; seed?: number } = {},
): { points: LabeledPoint[]; seed: number; allocation: { stratum: string; label: string; requested: number; placed: number; area_m2: number }[] } {
  if (!strata.length) throw new GeoToolError("no strata given");
  if (strata.length > 200) throw new GeoToolError("at most 200 strata");
  const seed = opts.seed ?? newSeed();
  const rand = seededRandom(seed);
  const areas = strata.map((s) => area(s.polygon));

  let counts: number[];
  if ("perStratum" in allocation) {
    if (!Number.isInteger(allocation.perStratum) || allocation.perStratum < 1) throw new GeoToolError("per_stratum must be ≥ 1");
    counts = strata.map(() => allocation.perStratum);
  } else {
    const total = allocation.total;
    if (!Number.isInteger(total) || total < strata.length) throw new GeoToolError("total must be at least the number of strata");
    const order = areas.map((a, i) => i).sort((a, b) => areas[b] - areas[a]);
    if (allocation.mode === "equal") {
      counts = strata.map(() => Math.floor(total / strata.length));
      for (let k = 0; k < total % strata.length; k++) counts[order[k]]++;
    } else {
      const floor = allocation.minPerStratum ?? 1;
      const sumA = areas.reduce((s, a) => s + a, 0) || 1;
      const free = total - floor * strata.length;
      if (free < 0) throw new GeoToolError("total is too small for min_per_stratum");
      const exact = areas.map((a) => (free * a) / sumA);
      counts = exact.map((e) => floor + Math.floor(e));
      const remainders = exact.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0]);
      for (let k = 0; k < total - counts.reduce((s, c) => s + c, 0); k++) counts[remainders[k][1]]++;
    }
  }
  if (counts.reduce((s, c) => s + c, 0) > MAX_POINTS) throw new GeoToolError(`more than ${MAX_POINTS} points requested`);

  const placed: LabeledPoint[] = [];
  const report = strata.map((s, i) => {
    const sub = randomInPolygon(s.polygon, counts[i], {
      edgeBufferM: opts.edgeBufferM,
      seed: Math.floor(rand() * 2 ** 31),
      labelPrefix: s.label,
      // spacing within the stratum here; across strata below
      minSpacingM: opts.minSpacingM,
    });
    let kept = 0;
    for (const p of sub.points) {
      if (opts.minSpacingM && placed.some((q) => measure(p, q).distanceM < opts.minSpacingM!)) continue;
      kept++;
      placed.push({ ...p, label: `${s.label}-${kept}`, meta: { stratum: String(s.id) } });
    }
    return { stratum: String(s.id), label: s.label, requested: counts[i], placed: kept, area_m2: Math.round(areas[i]) };
  });
  return { points: placed, seed, allocation: report };
}

/**
 * Points every `spacingM` along a line from `start` at `bearingDeg`.
 * By default the line runs `lengthM` and includes `start` itself. `count` fixes
 * the number of points instead of a length, and `startOffsetM` moves the first
 * point that far from `start` ("3 points, the first 10 m east of X").
 */
export function transect(
  start: LatLng,
  bearingDeg: number,
  lengthM: number | undefined,
  spacingM: number,
  opts: { labelPrefix?: string; count?: number; startOffsetM?: number } = {},
): LabeledPoint[] {
  checkLatLng(start, "start");
  if (!Number.isFinite(spacingM) || spacingM <= 0) throw new GeoToolError("spacing_m must be > 0");
  const offset = opts.startOffsetM ?? 0;
  if (!Number.isFinite(offset) || offset < 0 || offset > 20_000) throw new GeoToolError("start_offset_m must be between 0 and 20000");
  let n: number;
  if (opts.count != null) {
    if (!Number.isInteger(opts.count) || opts.count < 1) throw new GeoToolError("count must be a whole number ≥ 1");
    n = opts.count;
  } else {
    if (lengthM == null || !Number.isFinite(lengthM) || lengthM <= 0 || lengthM > 20_000) {
      throw new GeoToolError("give count, or length_m between 0 and 20000");
    }
    n = Math.floor(lengthM / spacingM + 1e-9) + 1;
  }
  if (n > MAX_POINTS) throw new GeoToolError(`more than ${MAX_POINTS} points — increase spacing_m`);
  if (offset + (n - 1) * spacingM > 20_000) throw new GeoToolError("the line would be longer than 20 km");
  const prefix = opts.labelPrefix ? `${opts.labelPrefix}-` : "T";
  return Array.from({ length: n }, (_, i) => {
    const d = offset + i * spacingM;
    return { ...destination(start, bearingDeg, d), label: `${prefix}${i + 1}`, meta: { distance_m: Math.round(d * 1000) / 1000 } };
  });
}

/** GeoJSON Point geometry string for a point (Sampling_Points.geometry format). */
export function pointGeometryString(p: LatLng): string {
  return JSON.stringify({ type: "Point", coordinates: [p.lng, p.lat] });
}
