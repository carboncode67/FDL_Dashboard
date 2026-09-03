"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import FieldDrawMapWrapper from "@/components/field-draw-map-wrapper"

// A geofence is meaningless without a boundary, so title + action_message +
// geometry are collected together in one full-page draw overlay and created
// in a single POST — unlike Fields (created first, boundary drawn after) or
// Forms (created with just a title, fields added after).
export function NewGeofencePage() {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [actionMessage, setActionMessage] = useState("")
  const [geometry, setGeometry] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleSave() {
    if (!title.trim()) { setError("Enter a name"); return }
    if (!actionMessage.trim()) { setError("Enter a notification message"); return }
    if (!geometry) { setError("Draw a boundary on the map first"); return }
    setError("")
    setSaving(true)
    try {
      const res = await fetch("/api/geofences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          geometry,
          action_type: "notification",
          action_message: actionMessage.trim(),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? "Failed to save")
        return
      }
      router.push(`/geofences/${json.id}/edit`)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 px-4 h-auto min-h-14 py-2 border-b border-slate-200 bg-white shrink-0">
        <Link
          href="/geofences"
          className="text-sm text-slate-500 hover:text-slate-900 shrink-0 flex items-center gap-1"
        >
          ← Geofences
        </Link>
        <span className="text-slate-300 shrink-0">/</span>
        <Input
          value={title}
          onChange={(e) => { setTitle(e.target.value); setError("") }}
          placeholder="Geofence name…"
          className="max-w-xs"
          autoFocus
        />
        <Input
          value={actionMessage}
          onChange={(e) => { setActionMessage(e.target.value); setError("") }}
          placeholder="Notification message on entry…"
          className="max-w-sm"
        />
        {error && <span className="text-sm text-red-500 shrink-0">{error}</span>}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" render={<Link href="/geofences" />}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !geometry || !title.trim() || !actionMessage.trim()}
          >
            {saving ? "Saving…" : "Save Geofence"}
          </Button>
        </div>
      </div>

      {/* Map fills the rest of the viewport */}
      <div className="flex-1 min-h-0">
        <FieldDrawMapWrapper onGeometryChange={setGeometry} fullscreen />
      </div>
    </div>
  )
}
