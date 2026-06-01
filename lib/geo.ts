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
