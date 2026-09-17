"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export interface UploadedPolygon {
  id: number
  label: string | null
  purpose: string
  geometry: string
  source: string
}

export interface UploadedPoint {
  id: number
  label: string | null
  geometry: string
  polygon_id: number | null
  experiment_test_id: number | null
  placement_method: string
}

type Status = "idle" | "uploading" | "error"

// Same drop-zone + EPSG UX and the same parse pipeline (lib/parse-boundaries.ts, via
// POST /api/sampling-maps/[id]/upload) as components/field-boundary-upload.tsx's field
// boundary uploads — the difference is this route keeps both polygon AND point
// features (a field-boundary upload only keeps polygons) and creates Sampling_Map_
// Polygons / Sampling_Points instead of Fields.
export function SamplingMapUploadDialog({
  open,
  onOpenChange,
  samplingMapId,
  onUploaded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  samplingMapId: number
  onUploaded: (polygons: UploadedPolygon[], points: UploadedPoint[]) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [epsg, setEpsg] = useState("4326")
  const [status, setStatus] = useState<Status>("idle")
  const [message, setMessage] = useState("")

  function handleFile(f: File) {
    setSelectedFile(f)
    setStatus("idle")
    setMessage("")
  }

  function reset() {
    setSelectedFile(null)
    setEpsg("4326")
    setStatus("idle")
    setMessage("")
    if (fileRef.current) fileRef.current.value = ""
  }

  const lowerName = selectedFile?.name.toLowerCase() ?? ""
  const isKmlLike = lowerName.endsWith(".kml") || lowerName.endsWith(".kmz")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedFile) return

    setStatus("uploading")
    setMessage("")

    const fd = new FormData()
    fd.append("file", selectedFile)
    fd.append("epsg", epsg)

    try {
      const res = await fetch(`/api/sampling-maps/${samplingMapId}/upload`, { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok) {
        setStatus("error")
        setMessage(json.error ?? "Upload failed")
        return
      }
      onUploaded(json.polygons ?? [], json.points ?? [])
      reset()
      onOpenChange(false)
    } catch {
      setStatus("error")
      setMessage("Network error — try again")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Polygons/Points</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div
            className={cn(
              "border-2 border-dashed rounded-lg px-4 py-6 text-center cursor-pointer transition-colors",
              dragging ? "border-blue-500 bg-blue-50" : "border-stone-200 hover:border-stone-400",
              selectedFile ? "bg-stone-50" : "",
            )}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const f = e.dataTransfer.files[0]
              if (f) handleFile(f)
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".geojson,.json,.zip,.gpkg,.kml,.kmz"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
            {selectedFile ? (
              <p className="text-sm font-medium text-stone-700">{selectedFile.name}</p>
            ) : (
              <div>
                <p className="text-sm text-stone-500">Drop a file here or click to browse</p>
                <p className="text-xs text-stone-400 mt-1">
                  Supported: .geojson, .json, .zip (shapefile), .gpkg, .kml, .kmz — polygon
                  features become map polygons, point features become sampling points.
                </p>
              </div>
            )}
          </div>

          {isKmlLike ? (
            <p className="text-xs text-stone-400">
              KML/KMZ coordinates are always WGS84 — no coordinate system to set.
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <label className="text-sm text-stone-600 whitespace-nowrap">Coordinate System (EPSG)</label>
              <input
                type="number"
                value={epsg}
                onChange={(e) => setEpsg(e.target.value)}
                className="w-32 rounded-md border border-stone-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="4326"
                min={1}
              />
              {epsg !== "4326" && <span className="text-xs text-stone-400">will reproject to WGS84</span>}
            </div>
          )}

          {status === "error" && <p className="text-sm text-red-600">{message}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false) }}>
              Cancel
            </Button>
            <Button type="submit" disabled={!selectedFile || status === "uploading"}>
              {status === "uploading" ? "Uploading…" : "Upload"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
