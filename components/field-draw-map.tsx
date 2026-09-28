"use client"

import { useEffect, useRef, useState } from "react"
import { MapContainer, GeoJSON, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import "@geoman-io/leaflet-geoman-free"
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css"
import { BasemapTileLayer } from "@/components/basemap-tile-layer"
import { SatelliteToggleButton } from "@/components/satellite-toggle-button"

interface ExistingField {
  id: number
  name: string
  geometry: string | null
}

export interface FieldDrawMapProps {
  /** Read-only reference outlines (e.g. sibling fields not currently being edited). Click to select for editing. */
  existingFields?: ExistingField[]
  onFieldSelect?: (fieldId: number) => void
  /** The geometry to load into the editable layer, or null for a blank/new shape. */
  loadGeometry?: string | null
  /** Bump whenever `loadGeometry` should be (re)loaded, replacing whatever's currently drawn. */
  loadToken?: number
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
  loadGeometry,
  loadToken,
  onGeometryChange,
}: {
  loadGeometry?: string | null
  loadToken?: number
  onGeometryChange: (geojson: string | null) => void
}) {
  const map = useMap()
  const drawnLayers = useRef<L.Layer[]>([])
  const prevLoadToken = useRef(loadToken)

  // Replace whatever's currently drawn with `loadGeometry` (or clear it, if null) —
  // used both for loading an existing field into the editor on click, and for
  // clearing back to blank after a save, without touching the map's pan/zoom.
  useEffect(() => {
    if (loadToken === undefined || loadToken === prevLoadToken.current) return
    prevLoadToken.current = loadToken
    loadIntoEditor(loadGeometry ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadToken])

  function getGeometry() {
    if (drawnLayers.current.length === 0) {
      onGeometryChange(null)
      return
    }
    const layer = drawnLayers.current[0] as L.Polygon
    const feature = layer.toGeoJSON()
    onGeometryChange(JSON.stringify(feature.geometry))
  }

  function clearDrawn() {
    drawnLayers.current.forEach((l) => map.removeLayer(l))
    drawnLayers.current = []
  }

  function loadIntoEditor(geometry: string | null) {
    clearDrawn()
    if (!geometry) {
      onGeometryChange(null)
      return
    }
    try {
      const parsed = JSON.parse(geometry)
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
    } catch {
      onGeometryChange(null)
    }
  }

  useEffect(() => {
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

    function handleCreate(e: any) {
      // Replace any previous drawn layer
      clearDrawn()
      drawnLayers.current = [e.layer]
      e.layer.on("pm:edit", getGeometry)
      getGeometry()
    }

    map.on("pm:create", handleCreate)

    // Load whatever geometry was provided before first mount, if any.
    if (loadGeometry) {
      loadIntoEditor(loadGeometry)
    }

    // This teardown must fully undo the setup above (not just detach the
    // listener) — React 19's Strict Mode runs effects mount→cleanup→mount
    // once in dev, and a partial teardown left the second mount's controls
    // and pm:create listener never re-attached, silently breaking every
    // draw/edit in local dev (Save stayed disabled no matter what was drawn).
    return () => {
      map.off("pm:create", handleCreate)
      map.pm.removeControls()
      clearDrawn()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

function BoundsAdjuster({ bounds }: { bounds: L.LatLngBoundsExpression }) {
  const map = useMap()
  const hasFit = useRef(false)
  useEffect(() => {
    // Fit once on first load only — recomputing `bounds` on every render (new
    // object identity each time) must never re-trigger this, or every unrelated
    // action (typing a name, toggling the basemap, finishing a shape) would
    // snap the view back out to the full extent.
    if (hasFit.current) return
    hasFit.current = true
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 })
  }, [map, bounds])
  return null
}

export default function FieldDrawMap({
  existingFields = [],
  onFieldSelect,
  loadGeometry,
  loadToken,
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
      : loadGeometry
        ? extractBounds(loadGeometry)
        : null

  const center: [number, number] =
    farmLat != null && farmLng != null ? [farmLat, farmLng] : [39.5, -98.35]

  const satelliteBtn = <SatelliteToggleButton satellite={isSatellite} onToggle={() => setIsSatellite((v) => !v)} />

  const existingFieldLayers = existingFields.map((f) => {
    if (!f.geometry) return null
    try {
      return (
        <GeoJSON
          key={`existing-${f.id}`}
          data={JSON.parse(f.geometry)}
          style={() => ({ color: "#16a34a", weight: 1.5, fillColor: "#16a34a", fillOpacity: 0.1, dashArray: "4" })}
          onEachFeature={(_, layer) => {
            layer.bindTooltip(f.name, { sticky: true })
            layer.on("click", () => onFieldSelect?.(f.id))
          }}
        />
      )
    } catch {
      return null
    }
  })

  if (fullscreen) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex justify-end px-2 py-1 shrink-0 border-b border-stone-100 bg-stone-50">
          {satelliteBtn}
        </div>
        <div className="flex-1 min-h-0 isolate">
          <MapContainer center={center} zoom={14} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
            {combinedBounds && <BoundsAdjuster bounds={combinedBounds} />}
            <BasemapTileLayer satellite={isSatellite} />
            {existingFieldLayers}
            <DrawControls loadGeometry={loadGeometry} loadToken={loadToken} onGeometryChange={onGeometryChange} />
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
      <div className="rounded-lg overflow-hidden border border-stone-200 isolate" style={{ height: 480 }}>
        <MapContainer center={center} zoom={14} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
          {combinedBounds && <BoundsAdjuster bounds={combinedBounds} />}

          <BasemapTileLayer satellite={isSatellite} />

          {/* Existing field boundaries — muted green for spatial context, click to edit */}
          {existingFieldLayers}

          <DrawControls loadGeometry={loadGeometry} loadToken={loadToken} onGeometryChange={onGeometryChange} />
        </MapContainer>
      </div>
      <p className="text-xs text-stone-500">
        Click the polygon tool in the top-left to draw a boundary, or click an existing field to edit it.
        Click vertices to edit after drawing. Toggle satellite view for better imagery.
      </p>
    </div>
  )
}
