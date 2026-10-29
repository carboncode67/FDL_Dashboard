"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { MapContainer, GeoJSON, CircleMarker, Popup, Polyline, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { BasemapTileLayer } from "@/components/basemap-tile-layer"
import { SatelliteToggleButton } from "@/components/satellite-toggle-button"
import { RasterLayer, VectorLayer, TiledBasemapLayer, type MapRaster } from "@/components/map-raster-layers"
import { TERRAIN_RAMP_CSS } from "@/lib/terrain-ramp"
import { NDVI_MAX, NDVI_MIN, NDVI_RAMP_CSS } from "@/lib/ndvi-ramp"
import { ContextTimeline } from "@/components/context-timeline"
import type { ContextTimeline as Timeline } from "@/lib/context-timeline"

export type { MapRaster }

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

export interface LabUploadPin {
  id: number
  latitude: number
  longitude: number
  uploaderName: string
  filename: string | null
  content: string | null
  media_type: string
  timestamp: string | null
}

export interface FarmMapProps {
  fields: MapField[]
  zones: MapZone[]
  photos: MapPhoto[]
  notes: MapNote[]
  farmId: number
  labUploads?: LabUploadPin[]
  rasters?: MapRaster[]
  // Newest GeoDaRT USGS 3DEP Context_Rasters row for this farm, if any — drives
  // the "Terrain" checkbox (server-rendered hillshade × elevation image).
  terrainRasterId?: number | null
  // Farm has dated GeoDaRT rasters (USDM drought, later imagery) — shows the
  // timeline under the map, fetched lazily from /api/farms/[id]/context/timeline.
  hasContextTimeline?: boolean
  farmLat?: number
  farmLng?: number
}

interface TerrainMeta {
  bounds: [[number, number], [number, number]]
  low: number
  high: number
  verticalExaggeration: number
  imageUrl: string
}

// Own pane between the basemap tiles (200) and vector overlays (400), so field
// boundaries and pins stay clickable on top of the terrain image.
const TERRAIN_PANE = "contextTerrain"

// The render is in geographic coordinates and Leaflet stretches an
// imageOverlay linearly in Web Mercator — over a farm-sized extent the
// north/south distortion that introduces is well under a pixel.
function TerrainLayer({ rasterId, onMeta, onError }: { rasterId: number; onMeta: (m: TerrainMeta) => void; onError: () => void }) {
  const map = useMap()
  useEffect(() => {
    if (!map.getPane(TERRAIN_PANE)) map.createPane(TERRAIN_PANE).style.zIndex = "350"
    let cancelled = false
    let overlay: L.ImageOverlay | null = null
    fetch(`/api/context/rasters/${rasterId}/terrain`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((meta: TerrainMeta) => {
        if (cancelled) return
        overlay = L.imageOverlay(meta.imageUrl, meta.bounds, { pane: TERRAIN_PANE, opacity: 0.85 }).addTo(map)
        onMeta(meta)
      })
      .catch(() => {
        if (!cancelled) onError()
      })
    return () => {
      cancelled = true
      overlay?.remove()
    }
  }, [map, rasterId, onMeta, onError])
  return null
}

type ImageryMode = "ndvi" | "rgb"

interface ImageryMeta {
  bounds: [[number, number], [number, number]]
  mode: ImageryMode
  masked: boolean
  clearFraction: number
  imageUrl: string
}

// Below terrain (350), so the Terrain layer can be laid over the imagery.
const IMAGERY_PANE = "contextImagery"

const imageryMetaUrl = (rasterId: number, mode: ImageryMode, mask: boolean) =>
  `/api/context/rasters/${rasterId}/imagery?mode=${mode}&mask=${mask ? 1 : 0}`

// One Sentinel-2 date, following the timeline playhead. A new date's image is
// added invisibly and only swapped in once it has loaded, so scrubbing never
// flashes an empty map; the neighbouring dates are rendered and fetched ahead.
function ImageryLayer({
  rasterId,
  mode,
  mask,
  opacity,
  prefetchIds,
  onMeta,
  onError,
}: {
  rasterId: number
  mode: ImageryMode
  mask: boolean
  opacity: number
  prefetchIds: number[]
  onMeta: (m: ImageryMeta) => void
  onError: () => void
}) {
  const map = useMap()
  const shownRef = useRef<L.ImageOverlay | null>(null)
  const opacityRef = useRef(opacity)

  useEffect(() => {
    if (!map.getPane(IMAGERY_PANE)) map.createPane(IMAGERY_PANE).style.zIndex = "340"
    return () => {
      shownRef.current?.remove()
      shownRef.current = null
    }
  }, [map])

  useEffect(() => {
    opacityRef.current = opacity
    shownRef.current?.setOpacity(opacity)
  }, [opacity])

  useEffect(() => {
    let cancelled = false
    let pending: L.ImageOverlay | null = null
    fetch(imageryMetaUrl(rasterId, mode, mask))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((meta: ImageryMeta) => {
        if (cancelled) return
        const overlay = L.imageOverlay(meta.imageUrl, meta.bounds, { pane: IMAGERY_PANE, opacity: 0 }).addTo(map)
        // 10 m pixels: show them as pixels rather than a blur.
        const el = overlay.getElement()
        if (el) el.style.imageRendering = "pixelated"
        pending = overlay
        overlay.once("load", () => {
          if (cancelled) return
          overlay.setOpacity(opacityRef.current)
          shownRef.current?.remove()
          shownRef.current = overlay
          pending = null
          onMeta(meta)
        })
        overlay.once("error", () => {
          if (!cancelled) onError()
        })
      })
      .catch(() => {
        if (!cancelled) onError()
      })
    return () => {
      cancelled = true
      pending?.remove()
    }
  }, [map, rasterId, mode, mask, onMeta, onError])

  const prefetchKey = prefetchIds.join(",")
  useEffect(() => {
    if (!prefetchKey) return
    let cancelled = false
    for (const id of prefetchKey.split(",").map(Number)) {
      fetch(imageryMetaUrl(id, mode, mask))
        .then((r) => (r.ok ? r.json() : null))
        .then((meta: ImageryMeta | null) => {
          if (meta && !cancelled) new Image().src = meta.imageUrl
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [prefetchKey, mode, mask])

  return null
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

const FIT_OPTIONS: L.FitBoundsOptions = { padding: [30, 30], maxZoom: 18 }

// Fits the map to the farm's data once, on mount. `bounds` is a new object on
// every render, so refitting on change would snap the view back to the full
// extent whenever a layer toggle or the timeline re-renders the map. The
// "Full extent" button refits on demand.
function BoundsAdjuster({ bounds }: { bounds: L.LatLngBoundsExpression }) {
  const map = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current) return
    fitted.current = true
    map.fitBounds(bounds, FIT_OPTIONS)
  }, [map, bounds])
  return null
}

export default function FarmMap({ fields, zones, photos, notes, farmId, labUploads = [], rasters = [], terrainRasterId = null, hasContextTimeline = false, farmLat, farmLng }: FarmMapProps) {
  const [gpsTracks, setGpsTracks] = useState<GpsTrack[]>([])
  const [isSatellite, setIsSatellite] = useState(false)
  const mapRef = useRef<L.Map | null>(null)
  // Off by default — overlaying every pipeline-output raster at once (e.g. 4+ from a
  // single EM38 interpolation run) would just be visual noise; the checklist below
  // the map lets someone turn on the one(s) they actually want to look at.
  // Keyed by rasterKey() (`${source}-${id}`), not the bare id — Basemap.id and
  // PipelineOutputRaster.id are separate, colliding ID spaces (items 6+7).
  const [visibleRasterIds, setVisibleRasterIds] = useState<Set<string>>(new Set())
  const [showTerrain, setShowTerrain] = useState(false)
  const [terrainMeta, setTerrainMeta] = useState<TerrainMeta | null>(null)
  const [terrainFailed, setTerrainFailed] = useState(false)
  const handleTerrainError = useCallback(() => setTerrainFailed(true), [])
  const [timeline, setTimeline] = useState<Timeline | null>(null)
  const [timelineDate, setTimelineDate] = useState<string | null>(null)
  const [imageryMode, setImageryMode] = useState<ImageryMode | "off">("ndvi")
  const [maskClouds, setMaskClouds] = useState(true)
  const [imageryOpacity, setImageryOpacity] = useState(0.85)
  const [imageryMeta, setImageryMeta] = useState<ImageryMeta | null>(null)
  const [imageryFailed, setImageryFailed] = useState(false)
  const handleImageryMeta = useCallback((m: ImageryMeta) => {
    setImageryMeta(m)
    setImageryFailed(false)
  }, [])
  const handleImageryError = useCallback(() => setImageryFailed(true), [])

  useEffect(() => {
    if (!hasContextTimeline) return
    fetch(`/api/farms/${farmId}/context/timeline`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Timeline | null) => setTimeline(data))
      .catch(() => {})
  }, [farmId, hasContextTimeline])

  useEffect(() => {
    fetch(`/api/farms/${farmId}/gps-tracks`)
      .then((r) => r.json())
      .then((data) => setGpsTracks(data.features ?? []))
      .catch(() => {})
  }, [farmId])

  // Same default as ContextTimeline: no explicit selection → the newest date.
  const imageryFrames = timeline?.imagery ?? []
  const selectedDate = timelineDate ?? imageryFrames[imageryFrames.length - 1]?.date ?? null
  const frameIdx = imageryFrames.findIndex((f) => f.date === selectedDate)
  const frame = frameIdx >= 0 ? imageryFrames[frameIdx] : null
  const prefetchIds = [imageryFrames[frameIdx - 1], imageryFrames[frameIdx + 1]]
    .filter((f): f is NonNullable<typeof f> => f != null && frameIdx >= 0)
    .map((f) => f.rasterId)

  // crsStatus === null covers rows from before this check existed — treated as
  // renderable so old data keeps behaving the way it always did.
  const renderableRasters = rasters.filter((r) => r.crsStatus !== "unclear")
  const unclearRasters = rasters.filter((r) => r.crsStatus === "unclear")
  const rasterKey = (r: MapRaster) => `${r.source ?? "pipeline"}-${r.id}`
  const pipelineOutputRasters = renderableRasters.filter((r) => (r.source ?? "pipeline") === "pipeline")
  const basemapRasters = renderableRasters.filter((r) => r.source === "basemap")

  const allLatLngs: [number, number][] = [
    ...fields.flatMap((f) => (f.geometry ? extractLatLngs(f.geometry) : [])),
    ...zones.flatMap((z) => (z.geometry ? extractLatLngs(z.geometry) : [])),
    ...photos.map((p) => [p.latitude, p.longitude] as [number, number]),
    ...notes.map((n) => [n.latitude, n.longitude] as [number, number]),
    ...labUploads.map((u) => [u.latitude, u.longitude] as [number, number]),
  ]

  const bounds = allLatLngs.length >= 2 ? L.latLngBounds(allLatLngs) : null
  const center: [number, number] =
    allLatLngs.length > 0
      ? allLatLngs[0]
      : farmLat != null && farmLng != null
        ? [farmLat, farmLng]
        : [39.5, -98.35]

  const hasData =
    fields.some((f) => f.geometry) ||
    zones.some((z) => z.geometry) ||
    photos.length > 0 ||
    notes.length > 0 ||
    labUploads.length > 0

  return (
    <div className="space-y-3">
      {!hasData && (
        <p className="text-sm text-stone-500 italic">
          No spatial data available for this farm yet. Field and zone boundaries appear once geometry is ingested;
          photos and notes appear once uploaded from the mobile app.
        </p>
      )}

      <div className="relative rounded-lg overflow-hidden border border-stone-200 isolate" style={{ height: 520 }}>
        <div className="absolute top-2 right-2 z-[1000] flex gap-1.5">
          {bounds && (
            <button
              type="button"
              onClick={() => mapRef.current?.fitBounds(bounds, FIT_OPTIONS)}
              className="text-xs font-medium bg-white border border-stone-300 rounded px-2.5 py-1 shadow-sm hover:bg-stone-50 transition-colors"
            >
              Full extent
            </button>
          )}
          <SatelliteToggleButton satellite={isSatellite} onToggle={() => setIsSatellite((v) => !v)} />
        </div>
        <MapContainer ref={mapRef} center={center} zoom={14} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
          {bounds && <BoundsAdjuster bounds={bounds} />}

          <BasemapTileLayer satellite={isSatellite} />

          {/* Pipeline outputs — toggled via the checklist below the map. A "CRS
              unclear" output never renders here regardless of the checkbox (see
              renderableRasters below) — geo_sanity couldn't confidently place it, so
              plotting it would risk showing data in the wrong spot with no warning. */}
          {pipelineOutputRasters.filter((r) => visibleRasterIds.has(rasterKey(r))).map((r) =>
            r.kind === "vector"
              ? <VectorLayer key={rasterKey(r)} url={r.url} />
              : <RasterLayer key={rasterKey(r)} url={r.url} />
          )}

          {/* Basemaps (items 6+7) — a lab member's directly-uploaded large raster,
              pre-tiled by PipelineProcessor. Same checkbox/CRS-unclear mechanism as
              pipeline outputs, rendered as a real tile layer instead of a whole-file
              fetch since these can be multi-GB sources. */}
          {basemapRasters.filter((r) => visibleRasterIds.has(rasterKey(r))).map((r) =>
            <TiledBasemapLayer key={rasterKey(r)} urlTemplate={r.url} footprint={r.footprint ?? null} minZoom={r.minZoom} maxZoom={r.maxZoom} />
          )}

          {imageryMode !== "off" && frame && (
            <ImageryLayer
              rasterId={frame.rasterId}
              mode={imageryMode}
              mask={maskClouds}
              opacity={imageryOpacity}
              prefetchIds={prefetchIds}
              onMeta={handleImageryMeta}
              onError={handleImageryError}
            />
          )}

          {showTerrain && terrainRasterId != null && (
            <TerrainLayer rasterId={terrainRasterId} onMeta={setTerrainMeta} onError={handleTerrainError} />
          )}

          {/* Field boundaries — blue, so they stand out against the green end of the NDVI ramp */}
          {fields.map((f) => {
            if (!f.geometry) return null
            try {
              return (
                <GeoJSON
                  key={`field-${f.id}`}
                  data={JSON.parse(f.geometry)}
                  style={() => ({ color: "#2563eb", weight: 2, fillColor: "#2563eb", fillOpacity: 0.1 })}
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
                  style={{ maxWidth: 220, maxHeight: 160, objectFit: "cover", borderRadius: 4, marginBottom: 6, display: "block", imageOrientation: "from-image" }}
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

          {/* Lab upload pins — orange (photo) / teal (other) */}
          {labUploads.map((u) => {
            const isPhoto = u.media_type === "photo"
            const color = isPhoto ? "#ea580c" : "#0d9488"
            const fill = isPhoto ? "#f97316" : "#14b8a6"
            return (
              <CircleMarker
                key={`lab-${u.id}`}
                center={[u.latitude, u.longitude]}
                radius={7}
                pathOptions={{ color, fillColor: fill, fillOpacity: 0.9, weight: 2 }}
              >
                <Popup>
                  {isPhoto && u.filename && (
                    <img
                      src={`/api/files/photos/${u.filename}`}
                      alt="Lab upload"
                      style={{ maxWidth: 220, maxHeight: 160, objectFit: "cover", borderRadius: 4, marginBottom: 6, display: "block", imageOrientation: "from-image" }}
                    />
                  )}
                  <strong>{isPhoto ? "Photo (Lab)" : `${u.media_type.charAt(0).toUpperCase() + u.media_type.slice(1)} (Lab)`}</strong>
                  <br />
                  {u.uploaderName}
                  {u.content && (
                    <>
                      <br />
                      {u.content.slice(0, 120)}{u.content.length > 120 ? "…" : ""}
                    </>
                  )}
                  {u.timestamp && (
                    <>
                      <br />
                      <span style={{ fontSize: "0.75rem" }}>{new Date(u.timestamp).toLocaleString()}</span>
                    </>
                  )}
                </Popup>
              </CircleMarker>
            )
          })}

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

      {(terrainRasterId != null || imageryFrames.length > 0) && (
        <div className="flex flex-wrap items-center gap-3 px-1 text-sm">
          <span className="text-stone-500">Spatial context:</span>
          {imageryFrames.length > 0 && (
            <>
              <label className="flex items-center gap-1.5 text-stone-700">
                Imagery
                <select
                  className="rounded border border-stone-300 bg-white px-1.5 py-0.5 text-sm"
                  value={imageryMode}
                  onChange={(e) => {
                    setImageryMode(e.target.value as ImageryMode | "off")
                    setImageryFailed(false)
                  }}
                >
                  <option value="off">Off</option>
                  <option value="ndvi">NDVI</option>
                  <option value="rgb">True colour</option>
                </select>
              </label>
              {imageryMode !== "off" && (
                <>
                  <label className="flex items-center gap-1.5 text-stone-700">
                    <input type="checkbox" checked={maskClouds} onChange={(e) => setMaskClouds(e.target.checked)} />
                    Mask clouds
                  </label>
                  <label className="flex items-center gap-1.5 text-stone-700">
                    Opacity
                    <input
                      type="range"
                      min={0.2}
                      max={1}
                      step={0.05}
                      value={imageryOpacity}
                      onChange={(e) => setImageryOpacity(Number(e.target.value))}
                      className="w-20"
                    />
                  </label>
                </>
              )}
            </>
          )}
          {terrainRasterId != null && (
            <label className="flex items-center gap-1.5 text-stone-700">
              <input
                type="checkbox"
                checked={showTerrain}
                onChange={(e) => {
                  setShowTerrain(e.target.checked)
                  setTerrainFailed(false)
                }}
              />
              Terrain
            </label>
          )}
          {showTerrain && terrainFailed && (
            <span className="text-xs text-amber-600">Couldn&apos;t load the terrain layer</span>
          )}
          {showTerrain && !terrainFailed && terrainMeta && (
            <span className="flex items-center gap-2 text-xs text-stone-600">
              <span>{Math.round(terrainMeta.low)} m</span>
              <span className="inline-block h-2.5 w-32 rounded-sm" style={{ background: TERRAIN_RAMP_CSS }} />
              <span>{Math.round(terrainMeta.high)} m</span>
              <span className="text-stone-400">· hillshade {terrainMeta.verticalExaggeration}× vertical exaggeration</span>
            </span>
          )}
        </div>
      )}

      {imageryMode !== "off" && frame && (
        <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-stone-600">
          {imageryFailed ? (
            <span className="text-amber-600">Couldn&apos;t load the imagery for {frame.date}</span>
          ) : (
            <>
              <span className="font-medium text-stone-700">
                Sentinel-2 {new Date(`${frame.date}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
              </span>
              {imageryMeta && (
                <span className="text-stone-400">· {Math.round(imageryMeta.clearFraction * 100)}% clear</span>
              )}
              {imageryMode === "ndvi" && (
                <span className="flex items-center gap-2">
                  <span>NDVI {NDVI_MIN}</span>
                  <span className="inline-block h-2.5 w-32 rounded-sm" style={{ background: NDVI_RAMP_CSS }} />
                  <span>{NDVI_MAX}</span>
                </span>
              )}
            </>
          )}
        </div>
      )}

      {timeline && <ContextTimeline timeline={timeline} value={timelineDate} onChange={setTimelineDate} />}

      {pipelineOutputRasters.length > 0 && (
        <div className="flex flex-wrap gap-3 px-1 text-sm">
          <span className="text-stone-500">Pipeline outputs:</span>
          {pipelineOutputRasters.map((r) => (
            <label key={rasterKey(r)} className="flex items-center gap-1.5 text-stone-700">
              <input
                type="checkbox"
                checked={visibleRasterIds.has(rasterKey(r))}
                onChange={(e) =>
                  setVisibleRasterIds((prev) => {
                    const next = new Set(prev)
                    if (e.target.checked) next.add(rasterKey(r))
                    else next.delete(rasterKey(r))
                    return next
                  })
                }
              />
              {r.label}
            </label>
          ))}
        </div>
      )}

      {basemapRasters.length > 0 && (
        <div className="flex flex-wrap gap-3 px-1 text-sm">
          <span className="text-stone-500">Basemaps:</span>
          {basemapRasters.map((r) => (
            <label key={rasterKey(r)} className="flex items-center gap-1.5 text-stone-700">
              <input
                type="checkbox"
                checked={visibleRasterIds.has(rasterKey(r))}
                onChange={(e) =>
                  setVisibleRasterIds((prev) => {
                    const next = new Set(prev)
                    if (e.target.checked) next.add(rasterKey(r))
                    else next.delete(rasterKey(r))
                    return next
                  })
                }
              />
              {r.label}
            </label>
          ))}
        </div>
      )}

      {unclearRasters.length > 0 && (
        <div className="flex flex-wrap gap-3 px-1 text-sm">
          <span className="text-amber-600">⚠ CRS unclear — not shown on map:</span>
          {unclearRasters.map((r) => (
            <a
              key={rasterKey(r)}
              href={r.downloadUrl ?? r.url}
              className="text-stone-700 underline decoration-dotted hover:text-stone-900"
              title="Location couldn't be verified against this farm — download and check manually"
            >
              {r.label}
            </a>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-stone-600 px-1">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-3 rounded" style={{ backgroundColor: "#2563eb", opacity: 0.7 }} />
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
          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: "#f97316" }} />
          Lab Photos
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: "#14b8a6" }} />
          Lab Uploads
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-5 border-t-2" style={{ borderColor: "#dc2626" }} />
          GPS Tracks
        </span>
      </div>
    </div>
  )
}
