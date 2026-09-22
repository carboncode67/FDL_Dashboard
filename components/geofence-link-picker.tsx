"use client"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"

interface LinkTarget {
  id: number
  title?: string
  name?: string
}

interface Props {
  forms: LinkTarget[]
  samplingMaps: LinkTarget[]
  linkedFormId: number | null
  linkedSamplingMapId: number | null
  onChange: (linkedFormId: number | null, linkedSamplingMapId: number | null) => void
}

// Notification geofences only — links a geofence to at most one Form or one Sampling Map, so
// tapping the resulting notification on-device can open the app to that target (see
// FarmerDataLogger/swift's GeofenceMonitor/NotificationScheduler for the consuming side).
// A single combined dropdown keeps the "at most one, of two possible kinds" constraint
// impossible to violate through the UI, mirroring the backend's mutually-exclusive CHECK.
export function GeofenceLinkPicker({ forms, samplingMaps, linkedFormId, linkedSamplingMapId, onChange }: Props) {
  const value = linkedFormId ? `form:${linkedFormId}` : linkedSamplingMapId ? `map:${linkedSamplingMapId}` : "none"

  function handleChange(v: string | null) {
    if (!v || v === "none") {
      onChange(null, null)
      return
    }
    const [kind, idStr] = v.split(":")
    const id = parseInt(idStr, 10)
    if (kind === "form") onChange(id, null)
    else if (kind === "map") onChange(null, id)
  }

  return (
    <div className="space-y-1.5">
      <Label>Link to (optional)</Label>
      <Select value={value} onValueChange={handleChange}>
        <SelectTrigger>
          <SelectValue placeholder="No link" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none" label="No link">No link</SelectItem>
          {forms.length > 0 && (
            <SelectGroup>
              <SelectLabel>Form</SelectLabel>
              {forms.map((f) => (
                <SelectItem key={`form:${f.id}`} value={`form:${f.id}`} label={f.title ?? `Form #${f.id}`}>
                  {f.title ?? `Form #${f.id}`}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          {samplingMaps.length > 0 && (
            <SelectGroup>
              <SelectLabel>Sampling Map</SelectLabel>
              {samplingMaps.map((m) => (
                <SelectItem key={`map:${m.id}`} value={`map:${m.id}`} label={m.name ?? `Map #${m.id}`}>
                  {m.name ?? `Map #${m.id}`}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>
      <p className="text-xs text-stone-500">Tapping the notification on-device opens the app to this Form or Sampling Map.</p>
    </div>
  )
}
