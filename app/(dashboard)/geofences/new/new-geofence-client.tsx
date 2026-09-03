"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import GeofenceZoneMap, { type ZoneCircle } from "@/components/geofence-zone-map"
import { boundingCircleForFields } from "@/lib/geo-zone"

interface FarmField {
  id: number
  Name: string | null
  geometry: string | null
}

interface Farm {
  id: number
  Farm_Name: string | null
  latitude: number | null
  longitude: number | null
  Fields: FarmField[]
}

interface WizardZone {
  tempId: string
  farm_id: number
  farm_name: string
  field_ids: number[]
  field_names: string[]
  center_lat: number
  center_lng: number
  radius_meters: number
}

type Step = "basics" | "farm" | "zone-map" | "notify"

// Replaces Phase 1's single freehand-polygon draw overlay with a multi-step wizard: name/
// description -> pick a farm -> select fields on that farm's map and confirm an (adjustable)
// bounding circle as a zone -> repeat across farms -> two notification-mode checkboxes ->
// submit. All zone data accumulates in this component's state; nothing is persisted until the
// single final POST /api/geofences, matching this repo's existing "full-page overlay, internal
// state" convention (see draw-field-client.tsx) rather than draft-persisting mid-wizard.
export function NewGeofencePage({ farms }: { farms: Farm[] }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>("basics")

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")

  const [farmQuery, setFarmQuery] = useState("")
  const [selectedFarmId, setSelectedFarmId] = useState<number | null>(null)

  const [selectedFieldIds, setSelectedFieldIds] = useState<Set<number>>(new Set())
  const [currentCircle, setCurrentCircle] = useState<ZoneCircle | null>(null)
  const [zones, setZones] = useState<WizardZone[]>([])

  const [notifyCircle, setNotifyCircle] = useState(true)
  const [notifyField, setNotifyField] = useState(false)
  const [actionMessage, setActionMessage] = useState("")
  const [showMessageOverride, setShowMessageOverride] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const selectedFarm = farms.find((f) => f.id === selectedFarmId) ?? null

  const filteredFarms = useMemo(() => {
    const q = farmQuery.trim().toLowerCase()
    if (!q) return farms
    return farms.filter((f) => (f.Farm_Name ?? "").toLowerCase().includes(q))
  }, [farms, farmQuery])

  function toggleField(fieldId: number) {
    setSelectedFieldIds((prev) => {
      const next = new Set(prev)
      if (next.has(fieldId)) next.delete(fieldId)
      else next.add(fieldId)
      return next
    })
    setCurrentCircle(null) // changing selection invalidates any already-computed circle
  }

  function handleAddZone() {
    if (!selectedFarm || selectedFieldIds.size === 0) return
    const selectedFields = selectedFarm.Fields.filter((f) => selectedFieldIds.has(f.id))
    const circle = boundingCircleForFields(selectedFields)
    if (!circle) {
      setError("Selected fields have no boundary data to build a zone from.")
      return
    }
    setError("")
    setCurrentCircle({ lat: circle.lat, lng: circle.lng, radiusMeters: circle.radiusMeters })
  }

  function handleConfirmZone() {
    if (!selectedFarm || !currentCircle || selectedFieldIds.size === 0) return
    const selectedFields = selectedFarm.Fields.filter((f) => selectedFieldIds.has(f.id))
    setZones((prev) => [
      ...prev,
      {
        tempId: crypto.randomUUID(),
        farm_id: selectedFarm.id,
        farm_name: selectedFarm.Farm_Name ?? `Farm #${selectedFarm.id}`,
        field_ids: selectedFields.map((f) => f.id),
        field_names: selectedFields.map((f) => f.Name ?? `Field #${f.id}`),
        center_lat: currentCircle.lat,
        center_lng: currentCircle.lng,
        radius_meters: currentCircle.radiusMeters,
      },
    ])
    setSelectedFieldIds(new Set())
    setCurrentCircle(null)
  }

  function removeZone(tempId: string) {
    setZones((prev) => prev.filter((z) => z.tempId !== tempId))
  }

  function goToFarmStep() {
    setSelectedFarmId(null)
    setSelectedFieldIds(new Set())
    setCurrentCircle(null)
    setStep("farm")
  }

  async function handleSubmit() {
    if (!title.trim()) { setError("Enter a name"); return }
    if (zones.length === 0) { setError("Add at least one zone"); return }
    setError("")
    setSaving(true)
    try {
      const res = await fetch("/api/geofences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          notify_on_circle_entry: notifyCircle,
          notify_on_field_entry: notifyField,
          action_message: actionMessage.trim() || null,
          zones: zones.map((z) => ({
            farm_id: z.farm_id,
            center_lat: z.center_lat,
            center_lng: z.center_lng,
            radius_meters: z.radius_meters,
            field_ids: z.field_ids,
          })),
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
      <div className="flex flex-wrap items-center gap-3 px-4 h-auto min-h-14 py-2 border-b border-slate-200 bg-white shrink-0">
        <Link href="/geofences" className="text-sm text-slate-500 hover:text-slate-900 shrink-0 flex items-center gap-1">
          ← Geofences
        </Link>
        <span className="text-slate-300 shrink-0">/</span>
        <span className="text-sm font-medium text-slate-700 shrink-0">New Geofence</span>
        {error && <span className="text-sm text-red-500 shrink-0">{error}</span>}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" render={<Link href="/geofences" />}>
            Cancel
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {step === "basics" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required />
              </div>
              <div className="space-y-1.5">
                <Label>Description (optional)</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <Button disabled={!title.trim()} onClick={() => setStep("farm")}>
                Next: Select a Farm
              </Button>
            </div>
          )}

          {step === "farm" && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-900">Select a Farm</h3>
              <Input
                placeholder="Search farms…"
                value={farmQuery}
                onChange={(e) => setFarmQuery(e.target.value)}
                autoFocus
              />
              <ul className="border rounded-lg divide-y max-h-80 overflow-y-auto">
                {filteredFarms.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                      onClick={() => {
                        setSelectedFarmId(f.id)
                        setSelectedFieldIds(new Set())
                        setCurrentCircle(null)
                        setStep("zone-map")
                      }}
                    >
                      {f.Farm_Name ?? `Farm #${f.id}`}
                      <span className="text-slate-400 ml-2">({f.Fields.length} fields)</span>
                    </button>
                  </li>
                ))}
                {filteredFarms.length === 0 && (
                  <li className="px-3 py-4 text-sm text-slate-400 italic">No farms match.</li>
                )}
              </ul>
              {zones.length > 0 && (
                <Button variant="outline" onClick={() => setStep("notify")}>
                  Done adding zones ({zones.length} so far) →
                </Button>
              )}
            </div>
          )}

          {step === "zone-map" && selectedFarm && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">{selectedFarm.Farm_Name ?? `Farm #${selectedFarm.id}`}</h3>
                <button type="button" onClick={goToFarmStep} className="text-sm text-emerald-700 hover:text-emerald-900">
                  Switch Farm
                </button>
              </div>

              <GeofenceZoneMap
                fields={selectedFarm.Fields}
                farmLat={selectedFarm.latitude ?? undefined}
                farmLng={selectedFarm.longitude ?? undefined}
                selectedFieldIds={selectedFieldIds}
                onToggleField={toggleField}
                circle={currentCircle}
                onCircleChange={setCurrentCircle}
              />

              <div className="flex items-center gap-2">
                {!currentCircle ? (
                  <Button disabled={selectedFieldIds.size === 0} onClick={handleAddZone}>
                    Add Zone ({selectedFieldIds.size} field{selectedFieldIds.size === 1 ? "" : "s"} selected)
                  </Button>
                ) : (
                  <>
                    <Button onClick={handleConfirmZone}>Confirm Zone</Button>
                    <Button variant="outline" onClick={() => setCurrentCircle(null)}>Adjust Selection</Button>
                  </>
                )}
              </div>

              {zones.length > 0 && (
                <div className="border rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-slate-500">Zones added so far</p>
                  <ul className="space-y-1">
                    {zones.map((z) => (
                      <li key={z.tempId} className="flex items-center justify-between text-sm">
                        <span>{z.farm_name} — {z.field_names.join(", ")}</span>
                        <button type="button" onClick={() => removeZone(z.tempId)} className="text-slate-400 hover:text-red-500 text-xs">
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                  <Button variant="outline" size="sm" onClick={() => setStep("notify")}>
                    Done adding zones →
                  </Button>
                </div>
              )}
            </div>
          )}

          {step === "notify" && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-900">Notifications</h3>

              <div className="border rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-slate-500">
                  {zones.length} zone{zones.length === 1 ? "" : "s"} across{" "}
                  {new Set(zones.map((z) => z.farm_id)).size} farm{new Set(zones.map((z) => z.farm_id)).size === 1 ? "" : "s"}
                </p>
                <ul className="space-y-1">
                  {zones.map((z) => (
                    <li key={z.tempId} className="text-sm">{z.farm_name} — {z.field_names.join(", ")}</li>
                  ))}
                </ul>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Checkbox id="notify-circle" checked={notifyCircle} onCheckedChange={(v) => setNotifyCircle(v === true)} />
                  <Label htmlFor="notify-circle" className="cursor-pointer font-normal">
                    Notify when near fields (entering a zone)
                  </Label>
                </div>
                <div className="flex items-center gap-3">
                  <Checkbox id="notify-field" checked={notifyField} onCheckedChange={(v) => setNotifyField(v === true)} />
                  <Label htmlFor="notify-field" className="cursor-pointer font-normal">
                    Notify when a specific field is entered
                  </Label>
                </div>
              </div>

              {!showMessageOverride ? (
                <button type="button" onClick={() => setShowMessageOverride(true)} className="text-xs text-emerald-700 hover:text-emerald-900">
                  Customize notification text →
                </button>
              ) : (
                <div className="space-y-1.5">
                  <Label>Notification message (optional override)</Label>
                  <Input
                    value={actionMessage}
                    onChange={(e) => setActionMessage(e.target.value)}
                    placeholder="Leave blank to auto-generate per event"
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setStep("farm")}>← Add More Zones</Button>
                <Button
                  disabled={saving || (!notifyCircle && !notifyField)}
                  onClick={handleSubmit}
                >
                  {saving ? "Saving…" : "Add Geofence"}
                </Button>
              </div>
              {!notifyCircle && !notifyField && (
                <p className="text-xs text-amber-600">Select at least one notification mode.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
