"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import FieldDrawMapWrapper from "@/components/field-draw-map-wrapper"

interface Props {
  farmId: number
  farmName: string
  existingFields: { id: number; name: string; geometry: string | null }[]
  farmLat?: number
  farmLng?: number
}

export function DrawFieldPage({ farmId, farmName, existingFields, farmLat, farmLng }: Props) {
  const router = useRouter()
  const [fieldName, setFieldName] = useState("")
  const [geometry, setGeometry] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleSave() {
    if (!fieldName.trim()) { setError("Enter a field name"); return }
    if (!geometry) { setError("Draw a boundary on the map first"); return }
    setError("")
    setSaving(true)
    try {
      const res = await fetch("/api/fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Name: fieldName.trim(),
          Farms_id: farmId,
          geometry,
          boundary_source: "drawn",
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(json.error ?? "Failed to save")
        return
      }
      router.push(`/farms/${farmId}`)
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
          href={`/farms/${farmId}`}
          className="text-sm text-slate-500 hover:text-slate-900 shrink-0 flex items-center gap-1"
        >
          ← {farmName}
        </Link>
        <span className="text-slate-300 shrink-0">/</span>
        <Input
          value={fieldName}
          onChange={(e) => { setFieldName(e.target.value); setError("") }}
          placeholder="Field name…"
          className="max-w-xs"
          autoFocus
        />
        {error && <span className="text-sm text-red-500 shrink-0">{error}</span>}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" render={<Link href={`/farms/${farmId}`} />}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !geometry || !fieldName.trim()}
          >
            {saving ? "Saving…" : "Save Field"}
          </Button>
        </div>
      </div>

      {/* Map fills the rest of the viewport */}
      <div className="flex-1 min-h-0">
        <FieldDrawMapWrapper
          existingFields={existingFields}
          onGeometryChange={setGeometry}
          farmLat={farmLat}
          farmLng={farmLng}
          fullscreen
        />
      </div>
    </div>
  )
}
