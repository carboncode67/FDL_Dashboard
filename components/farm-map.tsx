"use client"

import { useEffect, useState } from "react"
import { MapContainer, GeoJSON, CircleMarker, Popup, Polyline, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { BasemapTileLayer } from "@/components/basemap-tile-layer"
import { SatelliteToggleButton } from "@/components/satellite-toggle-button"
import { RasterLayer, VectorLayer, TiledBasemapLayer, type MapRaster } from "@/components/map-raster-layers"

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
  farmLat?: number
  farmLng?: number
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

export default function FarmMap({ fields, zones, photos, notes, farmId, labUploads = [], rasters = [], farmLat, farmLng }: FarmMapProps) {
  const [gpsTracks, setGpsTracks] = useState<GpsTrack[]>([])
  const [isSatellite, setIsSatellite] = useState(false)
  // Off by default — overlaying every pipeline-output raster at once (e.g. 4+ from a
  // single EM38 interpolation run) would just be visual noise; the checklist below
  // the map lets someone turn on the one(s) they actually want to look at.
  // Keyed by rasterKey() (`${source}-${id}`), not the bare id — Basemap.id and
  // PipelineOutputRaster.id are separate, colliding ID spaces (items 6+7).
  const [visibleRasterIds, setVisibleRasterIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch(`/api/farms/${farmId}/gps-tracks`)
      .then((r) => r.json())
      .then((data) => setGpsTracks(data.features ?? []))
      .catch(() => {})
  }, [farmId])

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
        <div className="absolute top-2 right-2 z-[1000]">
          <SatelliteToggleButton satellite={isSatellite} onToggle={() => setIsSatellite((v) => !v)} />
        </div>
        <MapContainer center={center} zoom={14} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
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
            <TiledBasemapLayer key={rasterKey(r)} urlTemplate={r.url} footprint={r.footprint ?? null} />
          )}

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
