import turfBuffer from "@turf/buffer";
import { feature as turfFeature } from "@turf/helpers";
import type { Polygon, MultiPolygon } from "geojson";

const METERS_PER_DEGREE_LAT = 111320;
const SQ_METERS_PER_ACRE = 4046.856;

type Coord = [number, number]; // [lng, lat]

function ringArea(ring: Coord[]): number {
  if (ring.length < 3) return 0;
  const meanLat = ring.reduce((s, [, lat]) => s + lat, 0) / ring.length;
  const cosLat = Math.cos((meanLat * Math.PI) / 180);
  const mPerLon = METERS_PER_DEGREE_LAT * cosLat;

  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    area += x1 * y2 - x2 * y1;
  }
  return (Math.abs(area) / 2) * METERS_PER_DEGREE_LAT * mPerLon;
}

function polygonArea(rings: Coord[][]): number {
  if (!rings.length) return 0;
  let area = ringArea(rings[0]);
  for (let i = 1; i < rings.length; i++) area -= ringArea(rings[i]);
  return Math.max(0, area);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function geometryAreaSqMeters(geom: any): number {
  if (!geom) return 0;
  switch (geom.type) {
    case "Polygon":
      return polygonArea(geom.coordinates);
    case "MultiPolygon":
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return geom.coordinates.reduce((s: number, p: any) => s + polygonArea(p), 0);
    case "GeometryCollection":
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (geom.geometries ?? []).reduce((s: number, g: any) => s + geometryAreaSqMeters(g), 0);
    default:
      return 0;
  }
}

// [minLng, minLat, maxLng, maxLat]
export type Bounds = [number, number, number, number];

function extendBounds(b: Bounds | null, coords: unknown): Bounds | null {
  if (!Array.isArray(coords)) return b;
  // A position is [number, number, ...]; anything else is a nested coordinate array.
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    const [lng, lat] = coords as number[];
    if (!b) return [lng, lat, lng, lat];
    return [Math.min(b[0], lng), Math.min(b[1], lat), Math.max(b[2], lng), Math.max(b[3], lat)];
  }
  let acc = b;
  for (const c of coords) acc = extendBounds(acc, c);
  return acc;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function geometryBounds(geom: any, b: Bounds | null): Bounds | null {
  if (!geom) return b;
  if (geom.type === "GeometryCollection") {
    let acc = b;
    for (const g of geom.geometries ?? []) acc = geometryBounds(g, acc);
    return acc;
  }
  return extendBounds(b, geom.coordinates);
}

/** Bounding box of a raw GeoJSON geometry / Feature / FeatureCollection string. */
export function geojsonBounds(geojsonStr: string | null | undefined): Bounds | null {
  if (!geojsonStr) return null;
  try {
    const parsed = JSON.parse(geojsonStr);
    if (parsed.type === "Feature") return geometryBounds(parsed.geometry, null);
    if (parsed.type === "FeatureCollection") {
      let acc: Bounds | null = null;
      for (const f of parsed.features ?? []) acc = geometryBounds(f?.geometry, acc);
      return acc;
    }
    return geometryBounds(parsed, null);
  } catch {
    return null;
  }
}

/** Union of several geometry bounding boxes (nulls skipped). */
export function unionBounds(all: (Bounds | null)[]): Bounds | null {
  let acc: Bounds | null = null;
  for (const b of all) {
    if (!b) continue;
    acc = acc
      ? [Math.min(acc[0], b[0]), Math.min(acc[1], b[1]), Math.max(acc[2], b[2]), Math.max(acc[3], b[3])]
      : b;
  }
  return acc;
}

/**
 * A closed [[lng,lat],...] ring for `bounds` expanded by `bufferMeters`, rounded
 * to 6 dp. This is the shape GeoDaRT's `aoi_coords` accepts (a bare ring — not a
 * GeoJSON geometry object).
 */
export function bboxRing(bounds: Bounds, bufferMeters = 0): [number, number][] {
  const dLat = bufferMeters / METERS_PER_DEGREE_LAT;
  const meanLat = (bounds[1] + bounds[3]) / 2;
  const dLng = bufferMeters / (METERS_PER_DEGREE_LAT * Math.cos((meanLat * Math.PI) / 180) || METERS_PER_DEGREE_LAT);
  const r = (n: number) => Math.round(n * 1e6) / 1e6;
  const minX = r(bounds[0] - dLng);
  const minY = r(bounds[1] - dLat);
  const maxX = r(bounds[2] + dLng);
  const maxY = r(bounds[3] + dLat);
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [minX, minY],
  ];
}

export function haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Ray-casting point-in-polygon. Ring coords are GeoJSON order: [lng, lat]. Shared by
// lib/proximity.ts (server-side Field lookups) and the sampling-map editor (client-side,
// checking a newly-placed point against the map's own already-loaded polygons — no DB
// round-trip needed there).
function pointInRing(lat: number, lng: number, ring: Coord[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pointInGeometry(lat: number, lng: number, geom: any): boolean {
  if (!geom) return false;
  switch (geom.type) {
    case "Polygon":
      return pointInRing(lat, lng, geom.coordinates[0]);
    case "MultiPolygon":
      return geom.coordinates.some((poly: Coord[][]) => pointInRing(lat, lng, poly[0]));
    case "Feature":
      return pointInGeometry(lat, lng, geom.geometry);
    case "FeatureCollection":
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (geom.features ?? []).some((f: any) => pointInGeometry(lat, lng, f));
    default:
      return false;
  }
}

/** Parses a raw GeoJSON geometry/Feature/FeatureCollection string (as stored on
 *  Sampling_Map_Polygons.geometry) and tests containment. Returns false on parse failure
 *  rather than throwing — callers are scanning several polygons and a malformed one
 *  should just not match, not abort the scan. */
export function pointInGeojsonString(lat: number, lng: number, geojsonStr: string | null | undefined): boolean {
  if (!geojsonStr) return false;
  try {
    return pointInGeometry(lat, lng, JSON.parse(geojsonStr));
  } catch {
    return false;
  }
}

/** Inward (negative) or outward (positive) buffer of a raw GeoJSON Polygon/MultiPolygon
 *  geometry string, in meters — e.g. a -10 buffer erodes the boundary 10m inward, which
 *  is how point generation keeps samples away from a field/polygon edge (Planned Changes
 *  item 4's "inverse buffer" — default -10m). Uses @turf/buffer (pure JS, no native/WASM
 *  deps, so it runs fine in this client-side generation-preview path) rather than hand-
 *  rolling polygon offsetting, which is not something to get right from scratch. Returns
 *  null if the buffer erodes the shape away entirely (e.g. distance wider than the
 *  polygon) or the input isn't a (Multi)Polygon — callers should treat null as "nothing
 *  to generate into" rather than falling back to the un-buffered shape. */
export function bufferGeojsonString(geojsonStr: string, distanceMeters: number): string | null {
  if (distanceMeters === 0) return geojsonStr;
  let geom: Polygon | MultiPolygon;
  try {
    const parsed = JSON.parse(geojsonStr);
    const g = parsed?.type === "Feature" ? parsed.geometry : parsed;
    if (g?.type !== "Polygon" && g?.type !== "MultiPolygon") return null;
    geom = g;
  } catch {
    return null;
  }
  try {
    const buffered = turfBuffer(turfFeature(geom), distanceMeters, { units: "meters" });
    if (!buffered?.geometry) return null;
    return JSON.stringify(buffered.geometry);
  } catch {
    return null;
  }
}

export function geojsonAreaAcres(geojsonStr: string | null | undefined): number {
  if (!geojsonStr) return 0;
  try {
    const parsed = JSON.parse(geojsonStr);
    let sqM = 0;
    if (parsed.type === "Feature") {
      sqM = geometryAreaSqMeters(parsed.geometry);
    } else if (parsed.type === "FeatureCollection") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sqM = (parsed.features ?? []).reduce((s: number, f: any) => s + geometryAreaSqMeters(f?.geometry), 0);
    } else {
      sqM = geometryAreaSqMeters(parsed);
    }
    return sqM / SQ_METERS_PER_ACRE;
  } catch {
    return 0;
  }
}

export interface GeneratedPoint {
  lat: number;
  lng: number;
}

// Planned Changes item 4 ("Create maps"): regular lattice of points at `spacingMeters`
// across a polygon's bounding box, filtered down to the ones that actually land inside
// the polygon. Spacing is converted from meters to degrees using the bbox's mean
// latitude — the same approximation bboxRing's buffer conversion uses, adequate at
// field scale. `maxPoints` is a hard stop so a tiny spacing on a large polygon can't
// hang the browser generating an unbounded grid.
export function generateGridPoints(geojsonStr: string, spacingMeters: number, maxPoints = 2000): GeneratedPoint[] {
  const bounds = geojsonBounds(geojsonStr);
  if (!bounds || spacingMeters <= 0) return [];
  const [minLng, minLat, maxLng, maxLat] = bounds;
  const meanLat = (minLat + maxLat) / 2;
  const dLat = spacingMeters / METERS_PER_DEGREE_LAT;
  const dLng = spacingMeters / (METERS_PER_DEGREE_LAT * Math.cos((meanLat * Math.PI) / 180) || METERS_PER_DEGREE_LAT);

  const points: GeneratedPoint[] = [];
  for (let lat = minLat; lat <= maxLat; lat += dLat) {
    for (let lng = minLng; lng <= maxLng; lng += dLng) {
      if (pointInGeojsonString(lat, lng, geojsonStr)) {
        points.push({ lat, lng });
        if (points.length >= maxPoints) return points;
      }
    }
  }
  return points;
}

// Rejection sampling: draw a random point in the polygon's bbox, keep it if it falls
// inside the polygon and (when minSpacingMeters is set) isn't too close to a point
// already accepted. Gives up after maxAttempts rather than looping forever if `count`
// can't be reached (e.g. minSpacingMeters too large for the polygon's area).
export function generateRandomPoints(
  geojsonStr: string,
  count: number,
  minSpacingMeters = 0,
  maxAttempts = 5000,
): GeneratedPoint[] {
  const bounds = geojsonBounds(geojsonStr);
  if (!bounds || count <= 0) return [];
  const [minLng, minLat, maxLng, maxLat] = bounds;

  const points: GeneratedPoint[] = [];
  let attempts = 0;
  while (points.length < count && attempts < maxAttempts) {
    attempts++;
    const lat = minLat + Math.random() * (maxLat - minLat);
    const lng = minLng + Math.random() * (maxLng - minLng);
    if (!pointInGeojsonString(lat, lng, geojsonStr)) continue;
    if (
      minSpacingMeters > 0 &&
      points.some((p) => haversineDistanceMeters(lat, lng, p.lat, p.lng) < minSpacingMeters)
    )
      continue;
    points.push({ lat, lng });
  }
  return points;
}
