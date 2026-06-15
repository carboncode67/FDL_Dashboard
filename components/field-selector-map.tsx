"use client"

import { useEffect } from "react"
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

interface SelectableField {
  id: number
  name: string | null
  geometry: string | null
}

interface UploadPin {
  id: number
  lat: number
  lng: number
  type: "photo" | "note" | "lab"
}

interface FieldSelectorMapProps {
  fields: SelectableField[]
  selectedIds: number[]
  onToggle: (id: number) => void
  uploadPins?: UploadPin[]
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
          obj.coordinates.forEach((ring: number[][]) => ring.forEach((c) => result.push([c[1], c[0]])))
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

const PIN_COLORS = {
  photo: "#3b82f6",
  note:  "#8b5cf6",
  lab:   "#f97316",
}

const PIN_LABELS = {
  photo: "Photo",
  note:  "Note",
  lab:   "Lab upload",
}

export default function FieldSelectorMap({ fields, selectedIds, onToggle, uploadPins = [] }: FieldSelectorMapProps) {
  const allLatLngs: [number, number][] = [
    ...fields.flatMap((f) => f.geometry ? extractLatLngs(f.geometry) : []),
    ...uploadPins.map((p) => [p.lat, p.lng] as [number, number]),
  ]
  const bounds = allLatLngs.length >= 2 ? L.latLngBounds(allLatLngs) : null
  const center: [number, number] = allLatLngs.length > 0 ? allLatLngs[0] : [39.5, -98.35]

  return (
    <div className="rounded-lg overflow-hidden border border-slate-200 isolate" style={{ height: 320 }}>
      <MapContainer center={center} zoom={14} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        {bounds && <BoundsAdjuster bounds={bounds} />}

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {fields.map((f) => {
          if (!f.geometry) return null
          const selected = selectedIds.includes(f.id)
          let parsed: any
          try { parsed = JSON.parse(f.geometry) } catch { return null }

          return (
            <GeoJSON
              key={`${f.id}-${selected}`}
              data={parsed}
              style={{
                color: selected ? "#2563eb" : "#16a34a",
                weight: 2,
                fillColor: selected ? "#2563eb" : "#16a34a",
                fillOpacity: selected ? 0.3 : 0.05,
              }}
              eventHandlers={{
                click: () => onToggle(f.id),
              }}
            >
            </GeoJSON>
          )
        })}

        {uploadPins.map((p) => (
          <CircleMarker
            key={`pin-${p.type}-${p.id}`}
            center={[p.lat, p.lng]}
            radius={5}
            pathOptions={{
              color:       PIN_COLORS[p.type],
              fillColor:   PIN_COLORS[p.type],
              fillOpacity: 0.8,
              weight: 1,
            }}
          >
            <Popup><span style={{ fontSize: 12 }}>{PIN_LABELS[p.type]}</span></Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}
