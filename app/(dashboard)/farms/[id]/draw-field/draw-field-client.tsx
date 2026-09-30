"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import Link from "next/link"
import { Plus, Check, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import FieldDrawMapWrapper from "@/components/field-draw-map-wrapper"

interface FieldRow {
  id: number
  name: string
  geometry: string | null
}

interface Props {
  farmId: number
  farmName: string
  existingFields: FieldRow[]
  farmLat?: number
  farmLng?: number
  canDeleteFields: boolean
}

export function DrawFieldPage({ farmId, farmName, existingFields, farmLat, farmLng, canDeleteFields }: Props) {
  const router = useRouter()
  // Local, session-owned copy of the farm's fields — edits/creates/deletes update this
  // directly rather than relying on `router.refresh()` to re-sync it. A soft refresh
  // doesn't reliably propagate updated field data back into this already-mounted page
  // (verified: re-selecting a just-renamed field after refresh still showed the old
  // name), so this page owns its own view of the data for the rest of the session.
  const [fields, setFields] = useState<FieldRow[]>(existingFields)
  const [selectedFieldId, setSelectedFieldId] = useState<number | null>(null)
  const [fieldName, setFieldName] = useState("")
  const [geometry, setGeometry] = useState<string | null>(null)
  const [pendingLoadGeometry, setPendingLoadGeometry] = useState<string | null>(null)
  const [loadToken, setLoadToken] = useState(0)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")
  const originalGeometryRef = useRef<string | null>(null)

  // Address search (Planned Changes item 17) — geocodes via Nominatim (same service/pattern as
  // components/forms/farm-form.tsx) and flies the map there, to help locate a field whose farm
  // doesn't have field geometry to auto-center on yet.
  const [addressQuery, setAddressQuery] = useState("")
  const [geocoding, setGeocoding] = useState(false)
  const [flyToTarget, setFlyToTarget] = useState<{ lat: number; lng: number } | null>(null)
  const [flyToToken, setFlyToToken] = useState(0)

  async function handleAddressSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!addressQuery.trim()) return
    setGeocoding(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addressQuery)}&format=json&limit=1`,
        { headers: { "Accept-Language": "en" } }
      )
      const data = await res.json()
      if (data.length > 0) {
        setFlyToTarget({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) })
        setFlyToToken((t) => t + 1)
      } else {
        toast.error("Address not found")
      }
    } catch {
      toast.error("Address lookup failed")
    } finally {
      setGeocoding(false)
    }
  }

  const farmHref = `/farms/${farmId}`

  function loadField(field: FieldRow | null) {
    setSelectedFieldId(field?.id ?? null)
    setFieldName(field?.name ?? "")
    originalGeometryRef.current = field?.geometry ?? null
    setPendingLoadGeometry(field?.geometry ?? null)
    setLoadToken((t) => t + 1)
    setError("")
    setConfirmingDelete(false)
  }

  function handleSelectField(id: number) {
    const field = fields.find((f) => f.id === id)
    if (field) loadField(field)
  }

  function handleNewField() {
    loadField(null)
  }

  async function handleSave() {
    if (!fieldName.trim()) { setError("Enter a field name"); return }
    if (!geometry) { setError("Draw a boundary on the map first"); return }
    setError("")
    setSaving(true)
    try {
      const geometryChanged = geometry !== originalGeometryRef.current
      const body: Record<string, unknown> = { Name: fieldName.trim(), geometry }
      // Only stamp boundary_source when the shape actually changed — a rename-only
      // save on an existing field must not clobber an "ingested"/"surveyed" source.
      if (geometryChanged) body.boundary_source = "drawn"
      if (!selectedFieldId) body.Farms_id = farmId

      const res = await fetch(selectedFieldId ? `/api/fields/${selectedFieldId}` : "/api/fields", {
        method: selectedFieldId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(json.error ?? "Failed to save")
        return
      }
      const saved = await res.json()
      if (selectedFieldId) {
        setFields((prev) => prev.map((f) => (f.id === selectedFieldId ? { ...f, name: fieldName.trim(), geometry } : f)))
      } else {
        setFields((prev) => [...prev, { id: saved.id, name: saved.Name ?? fieldName.trim(), geometry }])
      }
      setStatus(`Saved "${fieldName.trim()}" — click another field to edit it, or draw a new one`)
      toast.success(`Saved "${fieldName.trim()}"`)
      loadField(null)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selectedFieldId) return
    if (!confirmingDelete) { setConfirmingDelete(true); return }
    setDeleting(true)
    setError("")
    try {
      const res = await fetch(`/api/fields/${selectedFieldId}`, { method: "DELETE" })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(json.error ?? "Failed to delete")
        return
      }
      setFields((prev) => prev.filter((f) => f.id !== selectedFieldId))
      setStatus(`Deleted "${fieldName.trim() || "field"}"`)
      toast.success(`Deleted "${fieldName.trim() || "field"}"`)
      loadField(null)
      router.refresh()
    } finally {
      setDeleting(false)
    }
  }

  function handleDone() {
    router.push(farmHref)
    router.refresh()
  }

  // Hide the selected field from the read-only reference layer while it's loaded into the editor.
  const mapExistingFields = fields.filter((f) => f.id !== selectedFieldId)

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 min-h-14 border-b border-stone-200 bg-white shrink-0">
        <Link
          href={farmHref}
          className="text-sm text-stone-500 hover:text-stone-900 shrink-0 flex items-center gap-1"
        >
          ← {farmName}
        </Link>
        <span className="text-stone-300 shrink-0">/</span>
        <Input
          value={fieldName}
          onChange={(e) => { setFieldName(e.target.value); setError("") }}
          placeholder="Field name…"
          className="max-w-xs"
          autoFocus
        />
        {selectedFieldId && (
          <span className="text-xs text-stone-400 shrink-0">Editing existing field</span>
        )}
        <form onSubmit={handleAddressSearch} className="flex items-center gap-1.5 shrink-0">
          <Input
            value={addressQuery}
            onChange={(e) => setAddressQuery(e.target.value)}
            placeholder="Search an address…"
            className="max-w-48 h-8 text-sm"
          />
          <Button type="submit" variant="outline" size="icon-sm" disabled={geocoding || !addressQuery.trim()} aria-label="Search address">
            <Search className="h-3.5 w-3.5" />
          </Button>
        </form>
        {error && <span className="text-sm text-red-500 shrink-0">{error}</span>}
        {!error && status && <span className="text-sm text-emerald-600 shrink-0">{status}</span>}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {selectedFieldId && (
            <Button variant="outline" size="sm" onClick={handleNewField}>
              <Plus className="h-3.5 w-3.5" />
              New Field
            </Button>
          )}
          {selectedFieldId && canDeleteFields && (
            <Button
              variant={confirmingDelete ? "destructive" : "outline"}
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : confirmingDelete ? "Confirm Delete" : "Delete Field"}
            </Button>
          )}
          <Button variant="success" size="sm" onClick={handleDone}>
            Done
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !geometry || !fieldName.trim()}
          >
            {!saving && <Check className="h-3.5 w-3.5" />}
            {saving ? "Saving…" : selectedFieldId ? "Save Changes" : "Save Field"}
          </Button>
        </div>
      </div>

      <p className="px-4 py-1 text-xs text-stone-400 text-center border-b border-stone-100 shrink-0">
        You can edit a field&apos;s name or boundary later — just click it on the map to reopen it here.
      </p>

      {/* Map fills the rest of the viewport */}
      <div className="flex-1 min-h-0">
        <FieldDrawMapWrapper
          existingFields={mapExistingFields}
          onFieldSelect={handleSelectField}
          loadGeometry={pendingLoadGeometry}
          loadToken={loadToken}
          onGeometryChange={setGeometry}
          farmLat={farmLat}
          farmLng={farmLng}
          fullscreen
          flyToTarget={flyToTarget}
          flyToToken={flyToToken}
        />
      </div>
    </div>
  )
}
