"use client"

import { useEffect, useState } from "react"
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, Polyline, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

interface MapField {
  id: number
  name: string
  geometry: string | null
}

interface MapZone {
  id: number
  label: string
  repNumber: number | null
  geometry: string | null
}

interface MapPhoto {
  id: number
  filename: string
  latitude: number
  longitude: number
  note: string | null
  contactName: string
  timestamp: string | null
}

interface MapNote {
  id: number
  latitude: number
  longitude: number
  content: string
  contactName: string
  timestamp: string | null
}

interface GpsTrack {
  geometry: { type: string; coordinates: number[][] }
  properties: { contactName: string; startTime: string | null; kind: string; name?: string | null }
}

export interface FarmMapProps {
  fields: MapField[]
  zones: MapZone[]
  photos: MapPhoto[]
  notes: MapNote[]
  farmId: number
}

function extractLatLngs(geojsonStr: string): [number, number][] {
  try {
    const result: [number, number][] = []
    function walk(obj: any) {
      if (!obj) return
      switch (obj.type) {
        case "Point":
          result.push([obj.coordinates[1], obj.coordinates[0]])
          break
        case "LineString":
        case "MultiPoint":
          obj.coordinates.forEach((c: number[]) => result.push([c[1], c[0]]))
          break
        case "Polygon":
        case "MultiLineString":
          obj.coordinates.forEach((ring: number[][]) => ring.forEach((c: number[]) => result.push([c[1], c[0]])))
          break
        case "MultiPolygon":
          obj.coordinates.forEach((poly: number[][][]) =>
            poly.forEach((ring) => ring.forEach((c) => result.push([c[1], c[0]])))
          )
          break
        case "Feature":
          walk(obj.geometry)
          break
        case "FeatureCollection":
          obj.features.forEach((f: any) => walk(f))
          break
      }
    }
    walk(JSON.parse(geojsonStr))
    return result
  } catch {
    return []
  }
}

function BoundsAdjuster({ bounds }: { bounds: L.LatLngBoundsExpression }) {
  const map = useMap()
  useEffect(() => {
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 18 })
  }, [map, bounds])
  return null
}

export default function FarmMap({ fields, zones, photos, notes, farmId }: FarmMapProps) {
  const [gpsTracks, setGpsTracks] = useState<GpsTrack[]>([])

  useEffect(() => {
    fetch(`/api/farms/${farmId}/gps-tracks`)
      .then((r) => r.json())
      .then((data) => setGpsTracks(data.features ?? []))
      .catch(() => {})
  }, [farmId])

  const allLatLngs: [number, number][] = [
    ...fields.flatMap((f) => (f.geometry ? extractLatLngs(f.geometry) : [])),
    ...zones.flatMap((z) => (z.geometry ? extractLatLngs(z.geometry) : [])),
    ...photos.map((p) => [p.latitude, p.longitude] as [number, number]),
    ...notes.map((n) => [n.latitude, n.longitude] as [number, number]),
  ]

  const bounds = allLatLngs.length >= 2 ? L.latLngBounds(allLatLngs) : null
  const center: [number, number] = allLatLngs.length > 0 ? allLatLngs[0] : [39.5, -98.35]

  const hasData =
    fields.some((f) => f.geometry) ||
    zones.some((z) => z.geometry) ||
    photos.length > 0 ||
    notes.length > 0

  return (
    <div className="space-y-3">
      {!hasData && (
        <p className="text-sm text-slate-500 italic">
          No spatial data available for this farm yet. Field and zone boundaries appear once geometry is ingested;
          photos and notes appear once uploaded from the mobile app.
        </p>
      )}

      <div className="rounded-lg overflow-hidden border border-slate-200" style={{ height: 520 }}>
        <MapContainer center={center} zoom={14} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
          {bounds && <BoundsAdjuster bounds={bounds} />}

          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Field boundaries — green */}
          {fields.map((f) => {
            if (!f.geometry) return null
            try {
              return (
                <GeoJSON
                  key={`field-${f.id}`}
                  data={JSON.parse(f.geometry)}
                  style={() => ({ color: "#16a34a", weight: 2, fillColor: "#16a34a", fillOpacity: 0.15 })}
                  onEachFeature={(_, layer) =>
                    layer.bindPopup(`<strong>${f.name}</strong><br/>Field boundary`)
                  }
                />
              )
            } catch {
              return null
            }
          })}

          {/* Experiment zone boundaries — amber */}
          {zones.map((z) => {
            if (!z.geometry) return null
            try {
              return (
                <GeoJSON
                  key={`zone-${z.id}`}
                  data={JSON.parse(z.geometry)}
                  style={() => ({ color: "#d97706", weight: 2, fillColor: "#f59e0b", fillOpacity: 0.25 })}
                  onEachFeature={(_, layer) =>
                    layer.bindPopup(
                      `<strong>${z.label}</strong>${z.repNumber != null ? `<br/>Rep ${z.repNumber}` : ""}`
                    )
                  }
                />
              )
            } catch {
              return null
            }
          })}

          {/* Photo markers — blue */}
          {photos.map((p) => (
            <CircleMarker
              key={`photo-${p.id}`}
              center={[p.latitude, p.longitude]}
              radius={7}
              pathOptions={{ color: "#1d4ed8", fillColor: "#3b82f6", fillOpacity: 0.9, weight: 2 }}
            >
              <Popup>
                <img
                  src={`/api/files/photos/${p.filename}`}
                  alt={p.note ?? "Field photo"}
                  style={{ maxWidth: 220, maxHeight: 160, objectFit: "cover", borderRadius: 4, marginBottom: 6, display: "block" }}
                />
                <strong>Photo</strong>
                <br />
                {p.contactName}
                {p.note && (
                  <>
                    <br />
                    {p.note}
                  </>
                )}
                {p.timestamp && (
                  <>
                    <br />
                    <span style={{ fontSize: "0.75rem" }}>{new Date(p.timestamp).toLocaleString()}</span>
                  </>
                )}
              </Popup>
            </CircleMarker>
          ))}

          {/* Note markers — purple */}
          {notes.map((n) => (
            <CircleMarker
              key={`note-${n.id}`}
              center={[n.latitude, n.longitude]}
              radius={7}
              pathOptions={{ color: "#6d28d9", fillColor: "#8b5cf6", fillOpacity: 0.9, weight: 2 }}
            >
              <Popup>
                <strong>Note</strong>
                <br />
                {n.contactName}
                <br />
                {n.content}
                {n.timestamp && (
                  <>
                    <br />
                    <span style={{ fontSize: "0.75rem" }}>{new Date(n.timestamp).toLocaleString()}</span>
                  </>
                )}
              </Popup>
            </CircleMarker>
          ))}

          {/* GPS tracks — red */}
          {gpsTracks.map((track, i) => {
            if (track.geometry?.type !== "LineString" || !Array.isArray(track.geometry.coordinates)) return null
            const positions = track.geometry.coordinates
              .filter((c) => c.length >= 2)
              .map((c) => [c[1], c[0]] as [number, number])
            if (positions.length < 2) return null
            return (
              <Polyline
                key={`track-${i}`}
                positions={positions}
                pathOptions={{ color: "#dc2626", weight: 3, opacity: 0.8 }}
              >
                <Popup>
                  <strong>{track.properties.kind === "recording" ? "Audio Recording" : "Location Track"}</strong>
                  <br />
                  {track.properties.contactName}
                  {track.properties.name && (
                    <>
                      <br />
                      {track.properties.name}
                    </>
                  )}
                  {track.properties.startTime && (
                    <>
                      <br />
                      <span style={{ fontSize: "0.75rem" }}>{new Date(track.properties.startTime).toLocaleString()}</span>
                    </>
                  )}
                </Popup>
              </Polyline>
            )
          })}
        </MapContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600 px-1">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-3 rounded" style={{ backgroundColor: "#16a34a", opacity: 0.7 }} />
          Fields
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-3 rounded" style={{ backgroundColor: "#f59e0b", opacity: 0.8 }} />
          Experiment Zones
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: "#3b82f6" }} />
          Photos
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: "#8b5cf6" }} />
          Notes
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-5 border-t-2" style={{ borderColor: "#dc2626" }} />
          GPS Tracks
        </span>
      </div>
    </div>
  )
}
