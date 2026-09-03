// Deliberately self-contained (no import from lib/proximity.ts) — this module is used
// client-side (components/geofence-zone-map.tsx), and lib/proximity.ts pulls in the Prisma
// client at module scope, which can't be bundled into client code. haversineDistanceMeters is
// duplicated here rather than shared for that reason — same math as
// proximity.ts's exported copy.
function haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Flattens every ring vertex across Polygon/MultiPolygon/Feature/FeatureCollection as
// [lat, lng] pairs. Unlike lib/proximity.ts's polygonCentroid (which only averages the outer
// ring of a single geometry, adequate for its farm-matching use), the wizard's bounding-circle
// needs every vertex across possibly several selected fields' geometries.
function allVertices(geom: any): [number, number][] {
  if (!geom) return []
  switch (geom.type) {
    case "Polygon":
      return (geom.coordinates ?? []).flatMap((ring: number[][]) => ring.map((c) => [c[1], c[0]] as [number, number]))
    case "MultiPolygon":
      return (geom.coordinates ?? []).flatMap((poly: number[][][]) =>
        poly.flatMap((ring) => ring.map((c) => [c[1], c[0]] as [number, number]))
      )
    case "Feature":
      return allVertices(geom.geometry)
    case "FeatureCollection":
      return (geom.features ?? []).flatMap((f: any) => allVertices(f))
    default:
      return []
  }
}

// Bounding circle (centroid of all vertices across the given fields' geometries + distance to
// the farthest vertex + margin) for seeding a GeofenceZone's initial center/radius — staff can
// then drag/resize it in the wizard before saving. Same math as the (now-deleted, per the
// mobile clients no longer needing to derive circles themselves) Swift GeoJSONPolygon.
// boundingCircle / Kotlin GeoJsonPolygon.boundingCircle ports — this becomes the sole
// surviving implementation.
export function boundingCircleForFields(
  fields: { geometry: string | null }[],
  marginMeters = 75
): { lat: number; lng: number; radiusMeters: number } | null {
  const points = fields.flatMap((f) => {
    if (!f.geometry) return []
    try {
      return allVertices(JSON.parse(f.geometry))
    } catch {
      return []
    }
  })
  if (points.length === 0) return null

  const lat = points.reduce((s, p) => s + p[0], 0) / points.length
  const lng = points.reduce((s, p) => s + p[1], 0) / points.length

  const radiusMeters =
    Math.max(...points.map(([plat, plng]) => haversineDistanceMeters(lat, lng, plat, plng))) + marginMeters

  return { lat, lng, radiusMeters }
}
