"use client"

import { useEffect, useRef } from "react"
import { Rectangle, TileLayer, useMap } from "react-leaflet"
import L from "leaflet"
import type { Bounds } from "@/lib/geo"
import { NAIP_MAX_ZOOM, NAIP_MIN_ZOOM } from "@/lib/naip-bbox"

// Smallest box worth keeping (~10 m across at mid latitudes): a plain click
// without a drag shouldn't replace the saved box with a speck.
const MIN_BOX_DEGREES = 0.0001

const boxStyle = { color: "#d97706", weight: 2, fillColor: "#f59e0b", fillOpacity: 0.06, dashArray: "6,4" }

/**
 * Lives inside a MapContainer. Renders the saved NAIP bounding box, an optional
 * preview of the actual NAIP imagery clipped to it (served by the session-authed
 * /api/naip/tiles proxy), and — while `drawing` — a click-and-drag rectangle tool.
 *
 * Deliberately hand-rolled mouse handling rather than geoman's Rectangle tool:
 * sampling-map-editor.tsx's MapDrawLayers owns the map's single "pm:create"
 * handler and persists every created layer as a polygon/point row, so a geoman
 * rectangle would be saved as a sampling polygon.
 */
export function NaipBoxLayer({
  bbox,
  drawing,
  showPreview,
  onDrawn,
}: {
  bbox: Bounds | null
  drawing: boolean
  showPreview: boolean
  onDrawn: (bbox: Bounds) => void
}) {
  const map = useMap()
  // The draw handlers below are bound once per draw session; read the latest callback via a ref.
  const onDrawnRef = useRef(onDrawn)
  useEffect(() => {
    onDrawnRef.current = onDrawn
  })

  useEffect(() => {
    if (!drawing) return
    const container = map.getContainer()
    const prevCursor = container.style.cursor
    container.style.cursor = "crosshair"
    map.dragging.disable()

    let start: L.LatLng | null = null
    let rect: L.Rectangle | null = null

    const onDown = (e: L.LeafletMouseEvent) => {
      start = e.latlng
      rect = L.rectangle(L.latLngBounds(start, start), { ...boxStyle, interactive: false }).addTo(map)
    }
    const onMove = (e: L.LeafletMouseEvent) => {
      if (start && rect) rect.setBounds(L.latLngBounds(start, e.latlng))
    }
    const onUp = (e: L.LeafletMouseEvent) => {
      if (!start) return
      const b = L.latLngBounds(start, e.latlng)
      rect?.remove()
      start = null
      rect = null
      if (b.getEast() - b.getWest() < MIN_BOX_DEGREES || b.getNorth() - b.getSouth() < MIN_BOX_DEGREES) return
      // Wrap/clamp so a drag across the antimeridian or poles can't produce an invalid box.
      const clampLng = (n: number) => Math.max(-180, Math.min(180, n))
      const clampLat = (n: number) => Math.max(-85, Math.min(85, n))
      onDrawnRef.current([clampLng(b.getWest()), clampLat(b.getSouth()), clampLng(b.getEast()), clampLat(b.getNorth())])
    }

    map.on("mousedown", onDown)
    map.on("mousemove", onMove)
    map.on("mouseup", onUp)
    return () => {
      map.off("mousedown", onDown)
      map.off("mousemove", onMove)
      map.off("mouseup", onUp)
      rect?.remove()
      map.dragging.enable()
      container.style.cursor = prevCursor
    }
  }, [drawing, map])

  if (!bbox) return null
  const [w, s, e, n] = bbox
  const leafletBounds = L.latLngBounds([s, w], [n, e])
  return (
    <>
      {showPreview && (
        <TileLayer
          // Remount when the box changes: a TileLayer's `bounds` option isn't updatable in place.
          key={bbox.join(",")}
          url="/api/naip/tiles/{z}/{x}/{y}.jpg"
          bounds={leafletBounds}
          minZoom={NAIP_MIN_ZOOM}
          maxZoom={NAIP_MAX_ZOOM}
          attribution="Imagery: USDA NAIP via Microsoft Planetary Computer"
        />
      )}
      <Rectangle bounds={leafletBounds} pathOptions={{ ...boxStyle, interactive: false }} />
    </>
  )
}
