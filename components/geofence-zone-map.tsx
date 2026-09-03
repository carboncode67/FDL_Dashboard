"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import "@geoman-io/leaflet-geoman-free"
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css"

interface ZoneField {
  id: number
  Name: string | null
  geometry: string | null
}

export interface ZoneCircle {
  lat: number
  lng: number
  radiusMeters: number
}

export interface GeofenceZoneMapProps {
  fields: ZoneField[]
  farmLat?: number
  farmLng?: number
  selectedFieldIds: Set<number>
  onToggleField: (fieldId: number) => void
  // Non-null once "Add Zone" has computed a bounding circle — the map renders it as an
  // editable L.Circle and reports drag/resize edits back via onCircleChange. Circle creation
  // is deliberately never exposed as a raw geoman toolbar button (no drawCircle: true) —
  // there's no sane "empty circle with no field basis" state in this wizard's data model, so
  // a circle only ever exists here as a result of selecting fields first.
  circle: ZoneCircle | null
  onCircleChange: (circle: ZoneCircle) => void
}

function extractBounds(geojsonStr: string): L.LatLngBounds | null {
  try {
    const layer = L.geoJSON(JSON.parse(geojsonStr))
    const bounds = layer.getBounds()
    return bounds.isValid() ? bounds : null
  } catch {
    return null
  }
}

// Renders (and keeps in sync) a single editable L.Circle for the in-progress zone. Geoman's
// resizeableCircle default (true) makes the resize handle work immediately once .pm.enable()
// is called — same layer.on("pm:edit", ...) readback pattern field-draw-map.tsx already uses
// for polygons, just reading getLatLng()/getRadius() instead of toGeoJSON().
function CircleControls({
  circle,
  onCircleChange,
}: {
  circle: ZoneCircle | null
  onCircleChange: (circle: ZoneCircle) => void
}) {
  const map = useMap()
  const layerRef = useRef<L.Circle | null>(null)

  useEffect(() => {
    if (!circle) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
      return
    }

    if (layerRef.current) return // already rendering a circle for this zone draft

    const layer = L.circle([circle.lat, circle.lng], {
      radius: circle.radiusMeters,
      color: "#2563eb",
      fillColor: "#2563eb",
      fillOpacity: 0.15,
    }).addTo(map)
    layerRef.current = layer
    ;(layer as any).pm.enable()

    function report() {
      const center = layer.getLatLng()
      onCircleChange({ lat: center.lat, lng: center.lng, radiusMeters: layer.getRadius() })
    }
    layer.on("pm:edit", report)
    map.fitBounds(layer.getBounds(), { padding: [40, 40] })

    return () => {
      layer.off("pm:edit", report)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circle === null])

  return null
}

function BoundsAdjuster({ bounds }: { bounds: L.LatLngBoundsExpression }) {
  const map = useMap()
  useEffect(() => {
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 })
  }, [map, bounds])
  return null
}

export default function GeofenceZoneMap({
  fields,
  farmLat,
  farmLng,
  selectedFieldIds,
  onToggleField,
  circle,
  onCircleChange,
}: GeofenceZoneMapProps) {
  const [isSatellite, setIsSatellite] = useState(false)

  // Memoized on `fields` (stable across re-renders — the parent only passes a new array when
  // the selected farm changes, never on field-selection/circle-drag state updates) so the same
  // L.LatLngBounds object survives unrelated re-renders. Without this, a brand-new bounds
  // instance was computed on every render — including every field click and every circle
  // drag/resize — and BoundsAdjuster's effect (keyed on this object's reference) re-fit the
  // map to the full extent on each one, fighting the user's own pan/zoom mid-edit.
  const combinedBounds = useMemo(() => {
    const allFieldBounds = fields
      .filter((f) => f.geometry)
      .map((f) => extractBounds(f.geometry!))
      .filter(Boolean) as L.LatLngBounds[]
    return allFieldBounds.length > 0 ? allFieldBounds.reduce((acc, b) => acc.extend(b)) : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields])

  const center: [number, number] = farmLat != null && farmLng != null ? [farmLat, farmLng] : [39.5, -98.35]

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {circle
            ? "Drag the circle to move it, or drag its edge to resize."
            : "Click one or more fields, then Add Zone."}
        </p>
        <button
          type="button"
          onClick={() => setIsSatellite((v) => !v)}
          className="text-xs font-medium bg-white border border-slate-300 rounded px-2.5 py-1 shadow-sm hover:bg-slate-50 transition-colors"
        >
          {isSatellite ? "Map View" : "Satellite View"}
        </button>
      </div>
      <div className="rounded-lg overflow-hidden border border-slate-200 isolate" style={{ height: 480 }}>
        <MapContainer center={center} zoom={14} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
          {combinedBounds && <BoundsAdjuster bounds={combinedBounds} />}

          {isSatellite ? (
            <TileLayer
              key="satellite"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
            />
          ) : (
            <TileLayer
              key="osm"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
          )}

          {fields.map((f) => {
            if (!f.geometry) return null
            const selected = selectedFieldIds.has(f.id)
            try {
              return (
                <GeoJSON
                  key={`field-${f.id}-${selected}`}
                  data={JSON.parse(f.geometry)}
                  style={() => ({
                    color: selected ? "#2563eb" : "#16a34a",
                    weight: selected ? 2.5 : 1.5,
                    fillColor: selected ? "#2563eb" : "#16a34a",
                    fillOpacity: selected ? 0.35 : 0.1,
                  })}
                  onEachFeature={(_, layer) => {
                    layer.bindTooltip(f.Name ?? `Field #${f.id}`)
                    layer.on("click", () => onToggleField(f.id))
                  }}
                />
              )
            } catch {
              return null
            }
          })}

          <CircleControls circle={circle} onCircleChange={onCircleChange} />
        </MapContainer>
      </div>
    </div>
  )
}
