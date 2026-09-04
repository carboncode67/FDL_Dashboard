import { prisma } from "@/lib/prisma"
import { pointInGeometry as pointInGeom, haversineDistanceMeters } from "@/lib/geo"

// Returns [lng, lat] centroid as mean of outer ring vertices.
function polygonCentroid(geom: any): [number, number] | null {
  let ring: number[][] | null = null
  if (geom?.type === "Polygon") ring = geom.coordinates[0]
  else if (geom?.type === "MultiPolygon") ring = geom.coordinates[0]?.[0]
  else if (geom?.type === "Feature") return polygonCentroid(geom.geometry)
  if (!ring || ring.length === 0) return null
  const lng = ring.reduce((s, c) => s + c[0], 0) / ring.length
  const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length
  return [lng, lat]
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

// Returns both farmId and fieldId for lab member uploads.
// Step 1: exact polygon intersection → both ids set.
// Step 2: centroid within 1000 m → farmId set, fieldId null.
// Step 3: no match → both null.
export async function findFieldAndFarmByLocation(
  lat: number,
  lng: number,
): Promise<{ farmId: number | null; fieldId: number | null }> {
  const fields = await prisma.field.findMany({
    where: { geometry: { not: null }, Farms_id: { not: null } },
    select: { id: true, Farms_id: true, geometry: true },
  })

  for (const field of fields) {
    if (!field.geometry || !field.Farms_id) continue
    try {
      if (pointInGeom(lat, lng, JSON.parse(field.geometry)))
        return { farmId: field.Farms_id, fieldId: field.id }
    } catch {}
  }

  for (const field of fields) {
    if (!field.geometry || !field.Farms_id) continue
    try {
      const c = polygonCentroid(JSON.parse(field.geometry))
      if (c && haversineDistanceMeters(lat, lng, c[1], c[0]) <= 1000)
        return { farmId: field.Farms_id, fieldId: null }
    } catch {}
  }

  return { farmId: null, fieldId: null }
}

// Returns the field_id when a point falls inside a field polygon (for contact uploads where farm is already known).
export async function findFieldByLocation(lat: number, lng: number): Promise<number | null> {
  const fields = await prisma.field.findMany({
    where: { geometry: { not: null } },
    select: { id: true, geometry: true },
  })
  for (const field of fields) {
    if (!field.geometry) continue
    try {
      if (pointInGeom(lat, lng, JSON.parse(field.geometry))) return field.id
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
