import { prisma } from "@/lib/prisma"

// Ray-casting point-in-polygon. Ring coords are GeoJSON order: [lng, lat].
function pointInRing(lat: number, lng: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function pointInGeom(lat: number, lng: number, geom: any): boolean {
  if (!geom) return false
  switch (geom.type) {
    case "Polygon":
      return pointInRing(lat, lng, geom.coordinates[0])
    case "MultiPolygon":
      return geom.coordinates.some((poly: number[][][]) => pointInRing(lat, lng, poly[0]))
    case "Feature":
      return pointInGeom(lat, lng, geom.geometry)
    case "FeatureCollection":
      return geom.features.some((f: any) => pointInGeom(lat, lng, f))
    default:
      return false
  }
}

// Returns the farm_id of the first field boundary that contains the given point, or null.
export async function findFarmByLocation(lat: number, lng: number): Promise<number | null> {
  const fields = await prisma.field.findMany({
    where: { geometry: { not: null }, Farms_id: { not: null } },
    select: { Farms_id: true, geometry: true },
  })
  for (const field of fields) {
    if (!field.geometry || !field.Farms_id) continue
    try {
      if (pointInGeom(lat, lng, JSON.parse(field.geometry))) return field.Farms_id
    } catch {}
  }
  return null
}

// Extracts [lat, lng] from the first coordinate of a GeoJSON LineString or Feature<LineString>.
export function firstPointFromGeoJSON(json: string): { lat: number; lng: number } | null {
  try {
    const obj = JSON.parse(json)
    const coords: any[] = obj.type === "Feature" ? obj.geometry?.coordinates : obj.coordinates
    if (!Array.isArray(coords) || coords.length === 0) return null
    const first = coords[0]
    if (Array.isArray(first) && first.length >= 2) return { lat: first[1], lng: first[0] }
  } catch {}
  return null
}

// Central resolver: returns farm_id based on contact type and optional GPS position.
export async function resolveFarmId(
  contact: { farms_id: number | null; is_lab_member: boolean },
  lat: number | null,
  lng: number | null,
): Promise<number | null> {
  if (!contact.is_lab_member) return contact.farms_id
  if (lat == null || lng == null) return null
  return findFarmByLocation(lat, lng)
}

// Resolver for lab member uploads — always uses proximity.
export async function resolveFarmIdForLabMember(
  lat: number | null,
  lng: number | null,
): Promise<number | null> {
  if (lat == null || lng == null) return null
  return findFarmByLocation(lat, lng)
}
