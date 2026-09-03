"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import FieldDrawMapWrapper from "@/components/field-draw-map-wrapper"

interface Props {
  geofenceId: number
  geofenceTitle: string
  initialGeometry: string
}

export function EditGeofenceBoundaryPage({ geofenceId, geofenceTitle, initialGeometry }: Props) {
  const router = useRouter()
  const [geometry, setGeometry] = useState<string | null>(initialGeometry)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const backHref = `/geofences/${geofenceId}/edit`

  async function handleSave() {
    if (!geometry) { setError("Draw a boundary on the map first"); return }
    setError("")
    setSaving(true)
    try {
      const res = await fetch(`/api/geofences/${geofenceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geometry }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(json.error ?? "Failed to save")
        return
      }
      router.push(backHref)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-slate-200 bg-white shrink-0">
        <Link
          href={backHref}
          className="text-sm text-slate-500 hover:text-slate-900 shrink-0 flex items-center gap-1"
        >
          ← {geofenceTitle}
        </Link>
        <span className="text-sm font-medium text-slate-700 shrink-0 ml-1">Redraw Boundary</span>
        {error && <span className="text-sm text-red-500 shrink-0">{error}</span>}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" render={<Link href={backHref} />}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !geometry}
          >
            {saving ? "Saving…" : "Save Boundary"}
          </Button>
        </div>
      </div>

      {/* Map fills the rest of the viewport */}
      <div className="flex-1 min-h-0">
        <FieldDrawMapWrapper
          initialGeometry={initialGeometry}
          onGeometryChange={setGeometry}
          fullscreen
        />
      </div>
    </div>
  )
}
