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
