"use client"

import { useEffect, useState } from "react"
import { MapContainer, GeoJSON, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { BasemapTileLayer } from "@/components/basemap-tile-layer"
import { SatelliteToggleButton } from "@/components/satellite-toggle-button"

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

export default function FieldMap({ fieldName, geometry }: { fieldName: string; geometry: string }) {
  const [isSatellite, setIsSatellite] = useState(false)
  const latLngs = extractLatLngs(geometry)
  const bounds = latLngs.length >= 2 ? L.latLngBounds(latLngs) : null
  const center: [number, number] = latLngs.length > 0 ? latLngs[0] : [39.5, -98.35]

  let parsed: object | null = null
  try { parsed = JSON.parse(geometry) } catch { /* invalid json */ }

  return (
    <div className="relative rounded-lg overflow-hidden border border-slate-200" style={{ height: 420 }}>
      <div className="absolute top-2 right-2 z-[1000]">
        <SatelliteToggleButton satellite={isSatellite} onToggle={() => setIsSatellite((v) => !v)} />
      </div>
      <MapContainer center={center} zoom={14} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        {bounds && <BoundsAdjuster bounds={bounds} />}
        <BasemapTileLayer satellite={isSatellite} />
        {parsed && (
          <GeoJSON
            data={parsed as any}
            style={() => ({ color: "#16a34a", weight: 2, fillColor: "#16a34a", fillOpacity: 0.2 })}
            onEachFeature={(_, layer) => layer.bindPopup(`<strong>${fieldName}</strong>`)}
          />
        )}
      </MapContainer>
    </div>
  )
}
