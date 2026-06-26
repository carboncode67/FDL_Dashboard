"use client"

import { useEffect, useRef, useState } from "react"
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import "@geoman-io/leaflet-geoman-free"
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css"

interface ExistingField {
  id: number
  name: string
  geometry: string | null
}

export interface FieldDrawMapProps {
  existingFields?: ExistingField[]
  initialGeometry?: string | null
  onGeometryChange: (geojson: string | null) => void
  farmLat?: number
  farmLng?: number
  fullscreen?: boolean
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

function DrawControls({
  initialGeometry,
  onGeometryChange,
}: {
  initialGeometry?: string | null
  onGeometryChange: (geojson: string | null) => void
}) {
  const map = useMap()
  const initialized = useRef(false)
  const drawnLayers = useRef<L.Layer[]>([])

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    map.pm.addControls({
      position: "topleft",
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: false,
      drawPolygon: true,
      drawCircle: false,
      drawText: false,
      editMode: true,
      dragMode: false,
      cutPolygon: false,
      removalMode: false,
      rotateMode: false,
    })

    function getGeometry() {
      if (drawnLayers.current.length === 0) {
        onGeometryChange(null)
        return
      }
      const layer = drawnLayers.current[0] as L.Polygon
      const feature = layer.toGeoJSON()
      onGeometryChange(JSON.stringify(feature.geometry))
    }

    map.on("pm:create", (e: any) => {
      // Replace any previous drawn layer
      drawnLayers.current.forEach((l) => map.removeLayer(l))
      drawnLayers.current = [e.layer]
      e.layer.on("pm:edit", getGeometry)
      getGeometry()
    })

    // Load existing geometry for editing
    if (initialGeometry) {
      try {
        const parsed = JSON.parse(initialGeometry)
        const geoLayer = L.geoJSON(parsed)
        geoLayer.eachLayer((layer) => {
          layer.addTo(map)
          ;(layer as any).pm.enable()
          layer.on("pm:edit", getGeometry)
          drawnLayers.current.push(layer)
        })
        const bounds = geoLayer.getBounds()
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [20, 20] })
        }
        getGeometry()
      } catch {}
    }

    return () => {
      map.off("pm:create")
    }
  }, [])

  return null
}

function BoundsAdjuster({ bounds }: { bounds: L.LatLngBoundsExpression }) {
  const map = useMap()
  useEffect(() => {
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 })
  }, [map, bounds])
  return null
}

export default function FieldDrawMap({
  existingFields = [],
  initialGeometry,
  onGeometryChange,
  farmLat,
  farmLng,
  fullscreen = false,
}: FieldDrawMapProps) {
  const [isSatellite, setIsSatellite] = useState(false)

  // Compute initial center and bounds from existing fields or farm coords
  const allFieldBounds = existingFields
    .filter((f) => f.geometry)
    .map((f) => extractBounds(f.geometry!))
    .filter(Boolean) as L.LatLngBounds[]

  const combinedBounds =
    allFieldBounds.length > 0
      ? allFieldBounds.reduce((acc, b) => acc.extend(b))
      : initialGeometry
        ? extractBounds(initialGeometry)
        : null

  const center: [number, number] =
    farmLat != null && farmLng != null ? [farmLat, farmLng] : [39.5, -98.35]

  const satelliteBtn = (
    <button
      type="button"
      onClick={() => setIsSatellite((v) => !v)}
      className="text-xs font-medium bg-white border border-slate-300 rounded px-2.5 py-1 shadow-sm hover:bg-slate-50 transition-colors"
    >
      {isSatellite ? "Map View" : "Satellite View"}
    </button>
  )

  if (fullscreen) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex justify-end px-2 py-1 shrink-0 border-b border-slate-100 bg-slate-50">
          {satelliteBtn}
        </div>
        <div className="flex-1 min-h-0 isolate">
          <MapContainer center={center} zoom={14} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
            {combinedBounds && <BoundsAdjuster bounds={combinedBounds} />}
            {isSatellite ? (
              <TileLayer key="satellite" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community" />
            ) : (
              <TileLayer key="osm" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
            )}
            {existingFields.map((f) => {
              if (!f.geometry) return null
              try { return <GeoJSON key={`existing-${f.id}`} data={JSON.parse(f.geometry)} style={() => ({ color: "#16a34a", weight: 1.5, fillColor: "#16a34a", fillOpacity: 0.1, dashArray: "4" })} onEachFeature={(_, layer) => layer.bindPopup(`<strong>${f.name}</strong>`)} /> } catch { return null }
            })}
            <DrawControls initialGeometry={initialGeometry} onGeometryChange={onGeometryChange} />
          </MapContainer>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        {satelliteBtn}
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

          {/* Existing field boundaries — muted green for spatial context */}
          {existingFields.map((f) => {
            if (!f.geometry) return null
            try {
              return (
                <GeoJSON
                  key={`existing-${f.id}`}
                  data={JSON.parse(f.geometry)}
                  style={() => ({ color: "#16a34a", weight: 1.5, fillColor: "#16a34a", fillOpacity: 0.1, dashArray: "4" })}
                  onEachFeature={(_, layer) => layer.bindPopup(`<strong>${f.name}</strong>`)}
                />
              )
            } catch {
              return null
            }
          })}

          <DrawControls initialGeometry={initialGeometry} onGeometryChange={onGeometryChange} />
        </MapContainer>
      </div>
      <p className="text-xs text-slate-500">
        Click the polygon tool in the top-left to draw a boundary. Click vertices to edit after drawing.
        Toggle satellite view for better imagery.
      </p>
    </div>
  )
}
