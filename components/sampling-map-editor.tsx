"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import Link from "next/link"
import { MapContainer, CircleMarker, GeoJSON, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import "@geoman-io/leaflet-geoman-free"
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css"
import { BasemapTileLayer } from "@/components/basemap-tile-layer"
import { SatelliteToggleButton } from "@/components/satellite-toggle-button"
import { RasterLayer, VectorLayer, TiledBasemapLayer, type MapRaster } from "@/components/map-raster-layers"
import { ImportBoundaryDialog, type ImportableBoundary } from "@/components/import-boundary-dialog"
import { SamplingMapUploadDialog, type UploadedPolygon, type UploadedPoint } from "@/components/sampling-map-upload-dialog"
import { SamplingMapAssignmentPicker } from "@/components/sampling-map-assignment-picker"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  geojsonAreaAcres,
  pointInGeojsonString,
  generateGridPoints,
  generateRandomPoints,
  bufferGeojsonString,
  type GeneratedPoint,
} from "@/lib/geo"

export interface SamplingMapPolygonData {
  id: number
  label: string | null
  purpose: string
  geometry: string
  source: string
}

export interface SamplingPointData {
  id: number
  label: string | null
  geometry: string
  polygon_id: number | null
  experiment_test_id: number | null
  placement_method: string
}

export interface ExperimentTestOption {
  id: number
  testName: string
}

export interface SamplingMapAssignmentData {
  id: number
  user_id: string
  user_label: string
}

const PURPOSES = [
  { value: "boundary", label: "Boundary" },
  { value: "stratum", label: "Stratum" },
  { value: "exclusion", label: "Exclusion" },
]

const PURPOSE_STYLE: Record<string, { color: string; fillColor: string; dashArray?: string }> = {
  boundary: { color: "#2563eb", fillColor: "#2563eb" },
  stratum: { color: "#7c3aed", fillColor: "#7c3aed" },
  exclusion: { color: "#dc2626", fillColor: "#dc2626", dashArray: "6" },
}

function styleFor(purpose: string) {
  const s = PURPOSE_STYLE[purpose] ?? PURPOSE_STYLE.boundary
  return { color: s.color, weight: 2, fillColor: s.fillColor, fillOpacity: 0.15, dashArray: s.dashArray }
}

// Points are always this one style (not per-purpose like polygons) — teal, white
// ring, matching the CircleMarker convention already used for pins on farm-map.tsx /
// upload-point-map.tsx elsewhere in the app.
const POINT_STYLE = { radius: 7, color: "#ffffff", weight: 2, fillColor: "#059669", fillOpacity: 1 }

function pointLatLng(geojson: string): [number, number] | null {
  try {
    const parsed = JSON.parse(geojson)
    const coords = parsed?.type === "Point" ? parsed.coordinates : null
    if (!Array.isArray(coords) || coords.length < 2) return null
    return [coords[1], coords[0]]
  } catch {
    return null
  }
}

function boundsOfPolygons(polygons: SamplingMapPolygonData[]): L.LatLngBounds | null {
  let acc: L.LatLngBounds | null = null
  for (const p of polygons) {
    try {
      const b = L.geoJSON(JSON.parse(p.geometry)).getBounds()
      if (!b.isValid()) continue
      acc = acc ? acc.extend(b) : b
    } catch {
      // malformed geometry — skip
    }
  }
  return acc
}

interface MapDrawLayersHandle {
  addPolygon: (p: SamplingMapPolygonData) => void
  removePolygon: (id: number) => void
  restylePolygon: (id: number, purpose: string) => void
  addPoint: (p: SamplingPointData) => void
  removePoint: (id: number) => void
}

interface MapDrawLayersProps {
  initialPolygons: SamplingMapPolygonData[]
  initialPoints: SamplingPointData[]
  onCreatePolygon: (geojson: string) => Promise<SamplingMapPolygonData | null>
  onEditPolygon: (id: number, geojson: string) => void
  onCreatePoint: (geojson: string) => Promise<SamplingPointData | null>
  onEditPoint: (id: number, geojson: string) => void
}

// Polygons and points are both managed imperatively against the live Leaflet map
// instance (not via react-leaflet's declarative <GeoJSON>/<CircleMarker>) because
// @geoman-io/leaflet-geoman-free's pm.enable() needs the real Leaflet layer object,
// and each one here is an independently-persisted DB row rather than one geometry
// blob — same reasoning field-draw-map.tsx's DrawControls uses for its single
// geometry, generalized to two keyed collections. The imperative handle lets the
// side panel (which owns metadata like label/purpose/linked test) add/remove/restyle
// a layer after its own API call succeeds, without the map re-running its setup effect.
const MapDrawLayers = forwardRef<MapDrawLayersHandle, MapDrawLayersProps>(function MapDrawLayers(
  { initialPolygons, initialPoints, onCreatePolygon, onEditPolygon, onCreatePoint, onEditPoint },
  ref,
) {
  const map = useMap()
  const polygonLayersRef = useRef<Map<number, L.Layer>>(new Map())
  const pointLayersRef = useRef<Map<number, L.Layer>>(new Map())
  const initializedRef = useRef(false)

  function addPolygonLayer(p: SamplingMapPolygonData) {
    try {
      const parsed = JSON.parse(p.geometry)
      const geoLayer = L.geoJSON(parsed, { style: () => styleFor(p.purpose) })
      geoLayer.eachLayer((layer) => {
        layer.addTo(map)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(layer as any).pm.enable()
        layer.on("pm:edit", () => {
          const feature = (layer as L.Polygon).toGeoJSON()
          onEditPolygon(p.id, JSON.stringify(feature.geometry))
        })
        polygonLayersRef.current.set(p.id, layer)
      })
    } catch {
      // malformed geometry — skip rather than crash the editor
    }
  }

  function addPointLayer(p: SamplingPointData) {
    const latlng = pointLatLng(p.geometry)
    if (!latlng) return
    const layer = L.circleMarker(latlng, POINT_STYLE)
    layer.addTo(map)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(layer as any).pm.enable()
    layer.on("pm:edit", () => {
      const feature = layer.toGeoJSON()
      onEditPoint(p.id, JSON.stringify(feature.geometry))
    })
    pointLayersRef.current.set(p.id, layer)
  }

  useImperativeHandle(ref, () => ({
    addPolygon: addPolygonLayer,
    removePolygon(id) {
      const layer = polygonLayersRef.current.get(id)
      if (layer) {
        map.removeLayer(layer)
        polygonLayersRef.current.delete(id)
      }
    },
    restylePolygon(id, purpose) {
      const layer = polygonLayersRef.current.get(id) as L.Path | undefined
      layer?.setStyle?.(styleFor(purpose))
    },
    addPoint: addPointLayer,
    removePoint(id) {
      const layer = pointLayersRef.current.get(id)
      if (layer) {
        map.removeLayer(layer)
        pointLayersRef.current.delete(id)
      }
    },
  }))

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    map.pm.addControls({
      position: "topleft",
      drawMarker: false,
      // Sampling points use geoman's Circle Marker tool (not the pin Marker tool) so
      // they render as the same small dot used for pins everywhere else in the app
      // (farm-map.tsx / upload-point-map.tsx's CircleMarker convention).
      drawCircleMarker: true,
      drawPolyline: false,
      drawRectangle: false,
      drawPolygon: true,
      drawCircle: false,
      drawText: false,
      editMode: true,
      dragMode: false,
      cutPolygon: false,
      // Deletion goes through the side panel (DELETE + remove*) so it can also clear
      // the DB row — geoman's own removal mode would desync the map from the DB.
      removalMode: false,
      rotateMode: false,
    })

    initialPolygons.forEach(addPolygonLayer)
    initialPoints.forEach(addPointLayer)

    const bounds = boundsOfPolygons(initialPolygons)
    if (bounds) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.on("pm:create", async (e: any) => {
      if (e.shape === "Polygon") {
        const feature = (e.layer as L.Polygon).toGeoJSON()
        // Remove geoman's own draft layer — a styled, editable one goes back up once
        // the server confirms the created record, so the map never holds an editable
        // layer with no backing DB row.
        map.removeLayer(e.layer)
        const created = await onCreatePolygon(JSON.stringify(feature.geometry))
        if (created) addPolygonLayer(created)
      } else if (e.shape === "CircleMarker") {
        const feature = (e.layer as L.CircleMarker).toGeoJSON()
        map.removeLayer(e.layer)
        const created = await onCreatePoint(JSON.stringify(feature.geometry))
        if (created) addPointLayer(created)
      } else {
        map.removeLayer(e.layer)
      }
    })

    return () => {
      map.off("pm:create")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
})

export interface SamplingMapEditorProps {
  samplingMapId: number
  farmId: number
  farmName: string
  mapName: string
  farmLat?: number
  farmLng?: number
  initialPolygons: SamplingMapPolygonData[]
  initialPoints: SamplingPointData[]
  rasters: MapRaster[]
  importableFields: ImportableBoundary[]
  importableZones: ImportableBoundary[]
  experimentTests: ExperimentTestOption[]
  hasExperiment: boolean
  assignments: SamplingMapAssignmentData[]
  users: { id: string; name: string | null; email: string }[]
  forms: { id: number; title: string }[]
  formId: number | null
  proximityRadiusM: number | null
  // Planned Changes item 6.2 (raster-basemap toolset).
  availableBasemaps: { id: number; label: string }[]
  basemapId: number | null
  basemapBufferM: number | null
  basemapMaxZoom: number | null
}

export default function SamplingMapEditor({
  samplingMapId,
  farmId,
  farmName,
  mapName,
  farmLat,
  farmLng,
  initialPolygons,
  initialPoints,
  rasters,
  importableFields,
  importableZones,
  experimentTests,
  hasExperiment,
  assignments,
  users,
  forms,
  formId,
  proximityRadiusM,
  availableBasemaps,
  basemapId,
  basemapBufferM,
  basemapMaxZoom,
}: SamplingMapEditorProps) {
  const [polygons, setPolygons] = useState<SamplingMapPolygonData[]>(initialPolygons)
  const [points, setPoints] = useState<SamplingPointData[]>(initialPoints)
  const [isSatellite, setIsSatellite] = useState(false)
  // Keyed by rasterKey() (`${source}-${id}`), not the bare id — Basemap.id and
  // PipelineOutputRaster.id are separate, colliding ID spaces (items 6+7),
  // same reasoning as farm-map.tsx's identically-named state.
  const [visibleRasterIds, setVisibleRasterIds] = useState<Set<string>>(new Set())
  const [importOpen, setImportOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [linkedFormId, setLinkedFormId] = useState<number | null>(formId)
  const [savingForm, setSavingForm] = useState(false)
  // Text, not number, while editing — same reasoning as the comma-separated-options input in
  // form-schema-builder.tsx: keeps a half-typed value ("12." while typing "12.5") from being
  // silently coerced/rejected on every keystroke. Parsed to a number only in handleRadiusBlur.
  const [radiusText, setRadiusText] = useState(proximityRadiusM != null ? String(proximityRadiusM) : "")
  // Last-known-saved value, separate from the prop (which never updates without a full page
  // refresh) — handleRadiusBlur reverts to this on a failed save, not the original prop, so
  // two edits in a row can't revert past the first one's successful save.
  const [savedRadiusM, setSavedRadiusM] = useState(proximityRadiusM)
  const [savingRadius, setSavingRadius] = useState(false)

  // Planned Changes item 6.2 (raster-basemap toolset) — same "one setting per
  // map, saved from this toolbar" pattern as linkedFormId/radiusText above.
  const [linkedBasemapId, setLinkedBasemapId] = useState<number | null>(basemapId)
  const [savingBasemap, setSavingBasemap] = useState(false)
  const [bufferText, setBufferText] = useState(basemapBufferM != null ? String(basemapBufferM) : "")
  const [savedBufferM, setSavedBufferM] = useState(basemapBufferM)
  const [savingBuffer, setSavingBuffer] = useState(false)
  const [maxZoomText, setMaxZoomText] = useState(basemapMaxZoom != null ? String(basemapMaxZoom) : "")
  const [savedMaxZoom, setSavedMaxZoom] = useState(basemapMaxZoom)
  const [savingMaxZoom, setSavingMaxZoom] = useState(false)

  const layersApiRef = useRef<MapDrawLayersHandle>(null)

  // Every point on the map (existing, or created ad hoc in the field) is filled out against
  // this one form — see Sampling_Maps.form_id. Submitting it there also marks the point
  // Collected, so this is the one control that turns the map into a data-collection workflow.
  async function handleFormChange(value: string) {
    const newFormId = value === "none" ? null : parseInt(value)
    const previous = linkedFormId
    setLinkedFormId(newFormId)
    setSavingForm(true)
    try {
      const res = await fetch(`/api/sampling-maps/${samplingMapId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form_id: newFormId }),
      })
      if (!res.ok) setLinkedFormId(previous)
    } catch {
      setLinkedFormId(previous)
    } finally {
      setSavingForm(false)
    }
  }

  // Planned Changes #13.2: radius (meters) around every point on this map — mobile apps prompt
  // "Fill Form" when a fresh GPS fix lands inside it. Saved on blur, not per keystroke, same as
  // the farm-address geocode field. Empty/0 turns the feature off for this map (null on the wire).
  async function handleRadiusBlur() {
    const trimmed = radiusText.trim()
    const parsed = trimmed === "" ? null : Number(trimmed)
    if (parsed !== null && (isNaN(parsed) || parsed < 0)) {
      setRadiusText(savedRadiusM != null ? String(savedRadiusM) : "")
      return
    }
    const newValue = parsed === 0 ? null : parsed
    if (newValue === savedRadiusM) {
      setRadiusText(newValue != null ? String(newValue) : "")
      return
    }
    setRadiusText(newValue != null ? String(newValue) : "")
    setSavingRadius(true)
    try {
      const res = await fetch(`/api/sampling-maps/${samplingMapId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proximity_radius_m: newValue }),
      })
      if (res.ok) {
        setSavedRadiusM(newValue)
      } else {
        setRadiusText(savedRadiusM != null ? String(savedRadiusM) : "")
      }
    } catch {
      setRadiusText(savedRadiusM != null ? String(savedRadiusM) : "")
    } finally {
      setSavingRadius(false)
    }
  }

  // Planned Changes item 6.2: which uploaded Basemap (see Basemaps table,
  // docs/raster-tiling-plan.md) is offered to the phone app for this map,
  // plus how far beyond the field boundary to extend it (positive buffer —
  // opposite sign convention from the point-generation edge buffer below,
  // which erodes inward) and the max tiling level to send. Same instant-save
  // pattern as handleFormChange.
  async function handleBasemapChange(value: string) {
    const newBasemapId = value === "none" ? null : parseInt(value)
    const previous = linkedBasemapId
    setLinkedBasemapId(newBasemapId)
    setSavingBasemap(true)
    try {
      const res = await fetch(`/api/sampling-maps/${samplingMapId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ basemap_id: newBasemapId }),
      })
      if (!res.ok) setLinkedBasemapId(previous)
    } catch {
      setLinkedBasemapId(previous)
    } finally {
      setSavingBasemap(false)
    }
  }

  // Save-on-blur numeric field, same shape as handleRadiusBlur — factored
  // into one helper since basemap buffer and max zoom are otherwise identical.
  async function saveBasemapNumberField(
    raw: string,
    savedValue: number | null,
    field: "basemap_buffer_m" | "basemap_max_zoom",
    setText: (v: string) => void,
    setSaved: (v: number | null) => void,
    setSaving: (v: boolean) => void,
    validate?: (n: number) => boolean,
  ) {
    const trimmed = raw.trim()
    const parsed = trimmed === "" ? null : Number(trimmed)
    if (parsed !== null && (isNaN(parsed) || (validate && !validate(parsed)))) {
      setText(savedValue != null ? String(savedValue) : "")
      return
    }
    if (parsed === savedValue) {
      setText(parsed != null ? String(parsed) : "")
      return
    }
    setText(parsed != null ? String(parsed) : "")
    setSaving(true)
    try {
      const res = await fetch(`/api/sampling-maps/${samplingMapId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: parsed }),
      })
      if (res.ok) {
        setSaved(parsed)
      } else {
        setText(savedValue != null ? String(savedValue) : "")
      }
    } catch {
      setText(savedValue != null ? String(savedValue) : "")
    } finally {
      setSaving(false)
    }
  }

  // Grid/random point generation — a preview (client-side math only, nothing persisted
  // yet) tied to one polygon at a time, accepted as a single batch POST or discarded.
  const [generatingPolygonId, setGeneratingPolygonId] = useState<number | null>(null)
  const [genMethod, setGenMethod] = useState<"grid" | "random">("grid")
  const [genSpacing, setGenSpacing] = useState(30)
  const [genCount, setGenCount] = useState(10)
  const [genMinSpacing, setGenMinSpacing] = useState(0)
  // Inward buffer applied to the polygon before generating — keeps points off the
  // edge (e.g. of a field boundary). Negative = inward, default -10m.
  const [genBuffer, setGenBuffer] = useState(-10)
  const [previewPoints, setPreviewPoints] = useState<GeneratedPoint[]>([])
  const [previewBoundary, setPreviewBoundary] = useState<string | null>(null)
  const [genError, setGenError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)

  const renderableRasters = rasters // pipeline outputs + basemaps already filtered to crs_status !== "unclear" server-side (see page.tsx)
  const rasterKey = (r: MapRaster) => `${r.source ?? "pipeline"}-${r.id}`

  function toggleRaster(key: string) {
    setVisibleRasterIds((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleCreatePolygon(geojson: string): Promise<SamplingMapPolygonData | null> {
    const label = `Polygon ${polygons.length + 1}`
    const res = await fetch(`/api/sampling-maps/${samplingMapId}/polygons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ geometry: geojson, label, purpose: "boundary", source: "drawn" }),
    })
    if (!res.ok) return null
    const created: SamplingMapPolygonData = await res.json()
    setPolygons((prev) => [...prev, created])
    return created
  }

  async function handleEditPolygonGeometry(id: number, geojson: string) {
    setPolygons((prev) => prev.map((p) => (p.id === id ? { ...p, geometry: geojson } : p)))
    await fetch(`/api/sampling-maps/${samplingMapId}/polygons/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ geometry: geojson }),
    })
  }

  function handleLabelInput(id: number, label: string) {
    setPolygons((prev) => prev.map((p) => (p.id === id ? { ...p, label } : p)))
  }

  async function commitLabel(id: number) {
    const p = polygons.find((x) => x.id === id)
    if (!p) return
    await fetch(`/api/sampling-maps/${samplingMapId}/polygons/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: p.label }),
    })
  }

  async function handlePurposeChange(id: number, purpose: string) {
    setPolygons((prev) => prev.map((p) => (p.id === id ? { ...p, purpose } : p)))
    layersApiRef.current?.restylePolygon(id, purpose)
    await fetch(`/api/sampling-maps/${samplingMapId}/polygons/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose }),
    })
  }

  async function handleDeletePolygon(id: number) {
    if (!confirm("Delete this polygon? Any sampling points inside it are kept but unlinked from it.")) return
    const res = await fetch(`/api/sampling-maps/${samplingMapId}/polygons/${id}`, { method: "DELETE" })
    if (!res.ok) return
    layersApiRef.current?.removePolygon(id)
    setPolygons((prev) => prev.filter((p) => p.id !== id))
    // The DB SET NULLs the polygon_id on any points that were inside it — mirror that
    // locally so the side panel doesn't keep showing a stale polygon association.
    setPoints((prev) => prev.map((pt) => (pt.polygon_id === id ? { ...pt, polygon_id: null } : pt)))
  }

  async function handleImport(boundary: ImportableBoundary) {
    const res = await fetch(`/api/sampling-maps/${samplingMapId}/polygons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: boundary.kind,
        source_field_id: boundary.kind === "field" ? boundary.id : undefined,
        source_zone_id: boundary.kind === "zone" ? boundary.id : undefined,
        label: boundary.name,
      }),
    })
    if (!res.ok) return
    const created: SamplingMapPolygonData = await res.json()
    setPolygons((prev) => [...prev, created])
    layersApiRef.current?.addPolygon(created)
  }

  function handleUploaded(uploadedPolygons: UploadedPolygon[], uploadedPoints: UploadedPoint[]) {
    setPolygons((prev) => [...prev, ...uploadedPolygons])
    uploadedPolygons.forEach((p) => layersApiRef.current?.addPolygon(p))
    setPoints((prev) => [...prev, ...uploadedPoints])
    uploadedPoints.forEach((p) => layersApiRef.current?.addPoint(p))
  }

  function openGenerator(polygonId: number) {
    setGeneratingPolygonId(polygonId)
    setPreviewPoints([])
    setPreviewBoundary(null)
    setGenError(null)
  }

  function closeGenerator() {
    setGeneratingPolygonId(null)
    setPreviewPoints([])
    setPreviewBoundary(null)
    setGenError(null)
  }

  function runPreview() {
    const polygon = polygons.find((p) => p.id === generatingPolygonId)
    if (!polygon) return
    setGenError(null)

    const boundary = bufferGeojsonString(polygon.geometry, genBuffer)
    if (!boundary) {
      setPreviewPoints([])
      setPreviewBoundary(null)
      setGenError(
        genBuffer < 0
          ? "Buffer too large — it erodes the polygon away entirely. Try a smaller inward buffer."
          : "Couldn't buffer this polygon.",
      )
      return
    }
    setPreviewBoundary(boundary)

    const pts =
      genMethod === "grid"
        ? generateGridPoints(boundary, genSpacing)
        : generateRandomPoints(boundary, genCount, genMinSpacing)
    setPreviewPoints(pts)
  }

  async function handleAcceptGenerated() {
    if (!generatingPolygonId || previewPoints.length === 0) return
    setAccepting(true)
    try {
      const res = await fetch(`/api/sampling-maps/${samplingMapId}/points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          points: previewPoints.map((pt, i) => ({
            geometry: JSON.stringify({ type: "Point", coordinates: [pt.lng, pt.lat] }),
            polygon_id: generatingPolygonId,
            placement_method: genMethod,
            sample_index: i,
          })),
        }),
      })
      if (!res.ok) return
      const created: SamplingPointData[] = await res.json()
      setPoints((prev) => [...prev, ...created])
      created.forEach((c) => layersApiRef.current?.addPoint(c))
      closeGenerator()
    } finally {
      setAccepting(false)
    }
  }

  // Which polygon (if any) the point falls inside, checked against the polygons
  // already loaded client-side — no DB round-trip needed for this.
  function polygonIdAt(lat: number, lng: number): number | null {
    for (const p of polygons) {
      if (pointInGeojsonString(lat, lng, p.geometry)) return p.id
    }
    return null
  }

  async function handleCreatePoint(geojson: string): Promise<SamplingPointData | null> {
    const latlng = pointLatLng(geojson)
    const polygon_id = latlng ? polygonIdAt(latlng[0], latlng[1]) : null
    const label = `Point ${points.length + 1}`
    const res = await fetch(`/api/sampling-maps/${samplingMapId}/points`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ geometry: geojson, label, polygon_id, placement_method: "manual" }),
    })
    if (!res.ok) return null
    const created: SamplingPointData = await res.json()
    setPoints((prev) => [...prev, created])
    return created
  }

  async function handleEditPointGeometry(id: number, geojson: string) {
    const latlng = pointLatLng(geojson)
    const polygon_id = latlng ? polygonIdAt(latlng[0], latlng[1]) : null
    setPoints((prev) => prev.map((p) => (p.id === id ? { ...p, geometry: geojson, polygon_id } : p)))
    await fetch(`/api/sampling-maps/${samplingMapId}/points/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      // A dragged point may have moved into a different polygon (or out of all of
      // them) — recompute and save that alongside the new geometry.
      body: JSON.stringify({ geometry: geojson, polygon_id }),
    })
  }

  function handlePointLabelInput(id: number, label: string) {
    setPoints((prev) => prev.map((p) => (p.id === id ? { ...p, label } : p)))
  }

  async function commitPointLabel(id: number) {
    const p = points.find((x) => x.id === id)
    if (!p) return
    await fetch(`/api/sampling-maps/${samplingMapId}/points/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: p.label }),
    })
  }

  async function handleTestChange(id: number, experimentTestId: string) {
    const value = experimentTestId === "none" ? null : parseInt(experimentTestId)
    setPoints((prev) => prev.map((p) => (p.id === id ? { ...p, experiment_test_id: value } : p)))
    await fetch(`/api/sampling-maps/${samplingMapId}/points/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experiment_test_id: value }),
    })
  }

  async function handleDeletePoint(id: number) {
    if (!confirm("Delete this sampling point?")) return
    const res = await fetch(`/api/sampling-maps/${samplingMapId}/points/${id}`, { method: "DELETE" })
    if (!res.ok) return
    layersApiRef.current?.removePoint(id)
    setPoints((prev) => prev.filter((p) => p.id !== id))
  }

  const center: [number, number] =
    farmLat != null && farmLng != null ? [farmLat, farmLng] : [39.5, -98.35]

  const polygonLabel = (id: number | null) =>
    id == null ? null : polygons.find((p) => p.id === id)?.label ?? `Polygon #${id}`

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="flex items-center gap-3 px-4 h-14 border-b border-stone-200 bg-white shrink-0">
        <Link
          href={`/farms/${farmId}`}
          className="text-sm text-stone-500 hover:text-stone-900 shrink-0 flex items-center gap-1"
        >
          ← {farmName}
        </Link>
        <span className="text-stone-300 shrink-0">/</span>
        <span className="text-sm font-medium truncate">{mapName}</span>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <Select
            value={linkedFormId ? String(linkedFormId) : "none"}
            onValueChange={(v) => v && handleFormChange(v)}
            disabled={savingForm}
          >
            <SelectTrigger className="h-8 w-[180px] text-sm" title="Form every point on this map is filled out against">
              <SelectValue placeholder="Linked Form: None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" label="Linked Form: None">
                Linked Form: None
              </SelectItem>
              {forms.map((f) => (
                <SelectItem key={f.id} value={String(f.id)} label={f.title}>
                  {f.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5" title="Radius around every point that auto-prompts &quot;Fill Form&quot; on the phone when entered">
            <label htmlFor="proximity-radius" className="text-xs text-stone-500 whitespace-nowrap">
              Auto-prompt radius
            </label>
            <input
              id="proximity-radius"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={radiusText}
              onChange={(e) => setRadiusText(e.target.value)}
              onBlur={handleRadiusBlur}
              disabled={savingRadius}
              placeholder="Off"
              className="h-8 w-16 rounded-md border border-stone-200 px-2 text-sm"
            />
            <span className="text-xs text-stone-500">m</span>
          </div>
          <Select
            value={linkedBasemapId ? String(linkedBasemapId) : "none"}
            onValueChange={(v) => v && handleBasemapChange(v)}
            disabled={savingBasemap}
          >
            <SelectTrigger className="h-8 w-[170px] text-sm" title="Raster basemap sent to the phone app for this map">
              <SelectValue placeholder="Basemap: None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" label="Basemap: None">
                Basemap: None
              </SelectItem>
              {availableBasemaps.map((b) => (
                <SelectItem key={b.id} value={String(b.id)} label={b.label}>
                  {b.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {linkedBasemapId != null && (
            <>
              <div className="flex items-center gap-1.5" title="Extend the basemap this far beyond the field boundary before sending to the phone">
                <label htmlFor="basemap-buffer" className="text-xs text-stone-500 whitespace-nowrap">
                  Buffer
                </label>
                <input
                  id="basemap-buffer"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  value={bufferText}
                  onChange={(e) => setBufferText(e.target.value)}
                  onBlur={() =>
                    saveBasemapNumberField(
                      bufferText, savedBufferM, "basemap_buffer_m",
                      setBufferText, setSavedBufferM, setSavingBuffer,
                      (n) => n >= 0,
                    )
                  }
                  disabled={savingBuffer}
                  placeholder="0"
                  className="h-8 w-16 rounded-md border border-stone-200 px-2 text-sm"
                />
                <span className="text-xs text-stone-500">m</span>
              </div>
              <div className="flex items-center gap-1.5" title="Maximum tiling level sent to the phone app">
                <label htmlFor="basemap-max-zoom" className="text-xs text-stone-500 whitespace-nowrap">
                  Max zoom
                </label>
                <input
                  id="basemap-max-zoom"
                  type="number"
                  min={0}
                  max={24}
                  step={1}
                  inputMode="numeric"
                  value={maxZoomText}
                  onChange={(e) => setMaxZoomText(e.target.value)}
                  onBlur={() =>
                    saveBasemapNumberField(
                      maxZoomText, savedMaxZoom, "basemap_max_zoom",
                      setMaxZoomText, setSavedMaxZoom, setSavingMaxZoom,
                      (n) => n >= 0 && n <= 24 && Number.isInteger(n),
                    )
                  }
                  disabled={savingMaxZoom}
                  placeholder="Auto"
                  className="h-8 w-16 rounded-md border border-stone-200 px-2 text-sm"
                />
              </div>
            </>
          )}
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            Import Boundary
          </Button>
          <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
            Upload File
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
            Send to Phone{assignments.length > 0 ? ` (${assignments.length})` : ""}
          </Button>
          {linkedFormId != null && (
            <Button
              size="sm"
              variant="outline"
              render={<a href={`/api/sampling-maps/${samplingMapId}/responses/export`} />}
            >
              Download Responses
            </Button>
          )}
          <SatelliteToggleButton satellite={isSatellite} onToggle={() => setIsSatellite((v) => !v)} />
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-h-0 isolate">
          <MapContainer center={center} zoom={14} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
            <BasemapTileLayer satellite={isSatellite} />

            {renderableRasters
              .filter((r) => visibleRasterIds.has(rasterKey(r)))
              .map((r) =>
                r.source === "basemap" ? (
                  <TiledBasemapLayer key={rasterKey(r)} urlTemplate={r.url} footprint={r.footprint ?? null} />
                ) : r.kind === "vector" ? (
                  <VectorLayer key={rasterKey(r)} url={r.url} />
                ) : (
                  <RasterLayer key={rasterKey(r)} url={r.url} />
                ),
              )}

            <MapDrawLayers
              ref={layersApiRef}
              initialPolygons={initialPolygons}
              initialPoints={initialPoints}
              onCreatePolygon={handleCreatePolygon}
              onEditPolygon={handleEditPolygonGeometry}
              onCreatePoint={handleCreatePoint}
              onEditPoint={handleEditPointGeometry}
            />

            {/* The buffered (eroded) boundary points are actually generated within —
                shows the effect of the edge buffer before accepting. */}
            {previewBoundary && (() => {
              try {
                return (
                  <GeoJSON
                    data={JSON.parse(previewBoundary)}
                    style={() => ({ color: "#059669", weight: 1.5, fill: false, dashArray: "6,4" })}
                  />
                )
              } catch {
                return null
              }
            })()}

            {/* Grid/random generation preview — plain declarative markers (not
                geoman-managed like accepted points) since nothing here is persisted
                yet; dashed outline distinguishes them from real, saved points. */}
            {previewPoints.map((pt, i) => (
              <CircleMarker
                key={`preview-${i}`}
                center={[pt.lat, pt.lng]}
                radius={5}
                pathOptions={{ color: "#059669", weight: 1.5, fillColor: "#059669", fillOpacity: 0.35, dashArray: "2,2" }}
              />
            ))}
          </MapContainer>
        </div>

        <div className="w-80 shrink-0 border-l border-stone-200 overflow-y-auto p-3 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-stone-900">Polygons ({polygons.length})</h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Draw with the polygon tool (top-left of the map), or import an existing Field/Zone boundary.
            </p>
          </div>

          {rasters.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase text-stone-500 mb-1.5">Overlays</h4>
              <div className="space-y-1">
                {rasters.map((r) => (
                  <label key={rasterKey(r)} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={visibleRasterIds.has(rasterKey(r))}
                      onChange={() => toggleRaster(rasterKey(r))}
                    />
                    {r.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            {polygons.map((p) => (
              <div key={p.id} className="rounded border border-stone-200 p-2 space-y-1.5">
                <Input
                  value={p.label ?? ""}
                  placeholder={`Polygon ${p.id}`}
                  onChange={(e) => handleLabelInput(p.id, e.target.value)}
                  onBlur={() => commitLabel(p.id)}
                  className="h-8 text-sm"
                />
                <div className="flex items-center gap-2">
                  <Select value={p.purpose} onValueChange={(v) => v && handlePurposeChange(p.id, v)}>
                    <SelectTrigger className="h-8 text-sm flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PURPOSES.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} label={opt.label}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-stone-400 shrink-0">
                    {geojsonAreaAcres(p.geometry).toFixed(1)} ac
                  </span>
                </div>
                {p.source !== "drawn" && (
                  <p className="text-xs text-stone-400">Imported from {p.source === "field" ? "a Field" : "a Zone"}</p>
                )}
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs flex-1"
                    onClick={() => (generatingPolygonId === p.id ? closeGenerator() : openGenerator(p.id))}
                  >
                    {generatingPolygonId === p.id ? "Cancel Generate" : "Generate Points"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:text-red-700 h-7 px-2 text-xs"
                    onClick={() => handleDeletePolygon(p.id)}
                  >
                    Delete
                  </Button>
                </div>

                {generatingPolygonId === p.id && (
                  <div className="rounded bg-stone-50 border border-stone-200 p-2 space-y-2 mt-1">
                    <Select value={genMethod} onValueChange={(v) => v && setGenMethod(v as "grid" | "random")}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="grid" label="Grid">Grid</SelectItem>
                        <SelectItem value="random" label="Random">Random</SelectItem>
                      </SelectContent>
                    </Select>

                    <label className="block text-xs text-stone-500">
                      Edge buffer (meters, negative = inward)
                      <Input
                        type="number"
                        value={genBuffer}
                        onChange={(e) => setGenBuffer(Number(e.target.value) || 0)}
                        className="h-8 text-sm mt-0.5"
                      />
                    </label>

                    {genMethod === "grid" ? (
                      <label className="block text-xs text-stone-500">
                        Spacing (meters)
                        <Input
                          type="number"
                          min={1}
                          value={genSpacing}
                          onChange={(e) => setGenSpacing(Math.max(1, Number(e.target.value) || 0))}
                          className="h-8 text-sm mt-0.5"
                        />
                      </label>
                    ) : (
                      <>
                        <label className="block text-xs text-stone-500">
                          Point count
                          <Input
                            type="number"
                            min={1}
                            value={genCount}
                            onChange={(e) => setGenCount(Math.max(1, Number(e.target.value) || 0))}
                            className="h-8 text-sm mt-0.5"
                          />
                        </label>
                        <label className="block text-xs text-stone-500">
                          Min. spacing (meters, optional)
                          <Input
                            type="number"
                            min={0}
                            value={genMinSpacing}
                            onChange={(e) => setGenMinSpacing(Math.max(0, Number(e.target.value) || 0))}
                            className="h-8 text-sm mt-0.5"
                          />
                        </label>
                      </>
                    )}

                    <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={runPreview}>
                      Preview
                    </Button>

                    {genError && <p className="text-xs text-red-500">{genError}</p>}

                    {previewPoints.length > 0 && (
                      <>
                        <p className="text-xs text-stone-500">
                          {previewPoints.length} point(s) previewed on the map
                          {genBuffer !== 0 && ` (${genBuffer}m edge buffer applied)`}.
                        </p>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            className="flex-1 h-7 text-xs"
                            disabled={accepting}
                            onClick={handleAcceptGenerated}
                          >
                            {accepting ? "Saving…" : `Accept ${previewPoints.length}`}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => { setPreviewPoints([]); setPreviewBoundary(null) }}
                          >
                            Discard
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
            {polygons.length === 0 && (
              <p className="text-sm text-stone-400 italic">No polygons yet.</p>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-stone-900">Sampling Points ({points.length})</h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Use the circle-marker tool (top-left of the map) to place points by hand.
            </p>
            {!hasExperiment && (
              <p className="text-xs text-amber-600 mt-1">
                Link this map to an experiment (Farm → Maps) to connect points to its tests.
              </p>
            )}
          </div>

          <div className="space-y-2">
            {points.map((p) => (
              <div key={p.id} className="rounded border border-stone-200 p-2 space-y-1.5">
                <Input
                  value={p.label ?? ""}
                  placeholder={`Point ${p.id}`}
                  onChange={(e) => handlePointLabelInput(p.id, e.target.value)}
                  onBlur={() => commitPointLabel(p.id)}
                  className="h-8 text-sm"
                />
                {hasExperiment && (
                  <Select
                    value={p.experiment_test_id ? String(p.experiment_test_id) : "none"}
                    onValueChange={(v) => v && handleTestChange(p.id, v)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="No linked test" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" label="No linked test">
                        No linked test
                      </SelectItem>
                      {experimentTests.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)} label={t.testName}>
                          {t.testName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-stone-400">
                  {polygonLabel(p.polygon_id) ? `In ${polygonLabel(p.polygon_id)}` : "Not inside a polygon"}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:text-red-700 h-7 px-2 text-xs"
                  onClick={() => handleDeletePoint(p.id)}
                >
                  Delete
                </Button>
              </div>
            ))}
            {points.length === 0 && (
              <p className="text-sm text-stone-400 italic">No points yet.</p>
            )}
          </div>
        </div>
      </div>

      <ImportBoundaryDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        fields={importableFields}
        zones={importableZones}
        onImport={handleImport}
      />

      <SamplingMapUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        samplingMapId={samplingMapId}
        onUploaded={handleUploaded}
      />

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send to Phone</DialogTitle>
          </DialogHeader>
          <SamplingMapAssignmentPicker samplingMapId={samplingMapId} initialAssignments={assignments} users={users} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
