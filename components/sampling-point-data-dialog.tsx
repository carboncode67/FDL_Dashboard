"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { PointAnswer } from "@/app/api/sampling-maps/[id]/points/[pointId]/data/route"

interface PointData {
  point: { id: number; label: string | null }
  responses: {
    id: number
    form_title: string
    submitted_at: string
    recipient: string
    fix_quality: string | null
    h_accuracy: number | null
    answers: PointAnswer[]
  }[]
  collections: { id: number; occurred_at: string; collected_by: string; note: string | null }[]
}

interface Props {
  samplingMapId: number
  pointId: number | null
  pointLabel: string
  onClose: () => void
}

// What's been collected at one sampling point: every form response (answers + photos) and plain
// "mark collected" record. Photos are served by /api/files/photos/<filename>; each thumbnail
// opens full size, with a download link.
export function SamplingPointDataDialog({ samplingMapId, pointId, pointLabel, onClose }: Props) {
  // Parent passes key={pointId}, so state starts fresh for each point (no reset-in-effect needed).
  const [data, setData] = useState<PointData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (pointId === null) return
    let cancelled = false
    fetch(`/api/sampling-maps/${samplingMapId}/points/${pointId}/data`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not load point data")
        return res.json() as Promise<PointData>
      })
      .then((d) => { if (!cancelled) setData(d) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [samplingMapId, pointId])

  return (
    <Dialog open={pointId !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pointLabel}</DialogTitle>
        </DialogHeader>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {!data && !error && <p className="text-sm text-stone-500">Loading…</p>}

        {data && data.responses.length === 0 && data.collections.length === 0 && (
          <p className="text-sm text-stone-500">Nothing has been collected at this point yet.</p>
        )}

        {data?.responses.map((r) => (
          <div key={r.id} className="rounded border border-stone-200 p-3 space-y-2">
            <div className="text-xs text-stone-500">
              {r.form_title} · {new Date(r.submitted_at).toLocaleString()} · {r.recipient}
              {r.fix_quality ? ` · ${r.fix_quality}` : ""}
              {r.h_accuracy != null ? ` (±${r.h_accuracy.toFixed(2)} m)` : ""}
            </div>
            {r.answers.length === 0 && <p className="text-sm text-stone-400 italic">No answers recorded.</p>}
            <dl className="space-y-2">
              {r.answers.map((a) => (
                <div key={a.label}>
                  <dt className="text-xs font-medium text-stone-500">{a.label}</dt>
                  <dd className="text-sm text-stone-900">
                    {a.field_type === "photo" ? (
                      a.photo_filename ? (
                        <span className="inline-flex flex-col gap-1">
                          <a href={`/api/files/photos/${a.photo_filename}`} target="_blank" rel="noopener noreferrer">
                            <img
                              src={`/api/files/photos/${a.photo_filename}`}
                              alt={a.label}
                              className="max-h-56 rounded border border-stone-200 object-contain"
                              style={{ imageOrientation: "from-image" }}
                            />
                          </a>
                          <a
                            href={`/api/files/photos/${a.photo_filename}`}
                            download={a.photo_filename}
                            className="text-xs text-green-700 hover:text-green-900"
                          >
                            Download photo
                          </a>
                        </span>
                      ) : (
                        <span className="text-xs text-amber-600">Photo still uploading…</span>
                      )
                    ) : typeof a.value === "boolean" ? (
                      a.value ? "Yes" : "No"
                    ) : (
                      String(a.value)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}

        {data && data.collections.length > 0 && (
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-stone-900">Collection log</h4>
            {data.collections.map((c) => (
              <p key={c.id} className="text-xs text-stone-600">
                {new Date(c.occurred_at).toLocaleString()} · {c.collected_by}
                {c.note ? ` — ${c.note}` : ""}
              </p>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
