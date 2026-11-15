"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

/**
 * "Ask Cartographer" — the web side of interactive agent requests
 * (docs/cartographer-agent-plan.md §5.5). A person describes map work in plain
 * language; the Cartographer (on Datamachine) answers with a draft that shows
 * here as an overlay and is applied — by this person, with their permissions —
 * only when they click Apply. Undo removes exactly what a draft added.
 */

interface DraftFeature {
  type: "Feature"
  geometry: { type: "Point" | "Polygon"; coordinates: unknown }
  properties: { label?: string; purpose?: string }
}

export interface CartographerDraft {
  id: number
  status: "draft" | "applied" | "discarded" | "undone"
  explanation: string | null
  features: { type: "FeatureCollection"; features: DraftFeature[] }
}

interface AgentRequestRow {
  id: number
  prompt: string
  status: "queued" | "claimed" | "done" | "failed" | "cancelled" | "expired"
  answer: string | null
  created_at: string
  context: { point_id?: number }
  Drafts: CartographerDraft[]
}

const STATUS_LABEL: Record<AgentRequestRow["status"], { label: string; variant: "secondary" | "outline" | "destructive" }> = {
  queued: { label: "Waiting", variant: "outline" },
  claimed: { label: "Working…", variant: "outline" },
  done: { label: "Done", variant: "secondary" },
  failed: { label: "Couldn't do it", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "outline" },
  expired: { label: "Agent offline", variant: "destructive" },
}

const EXAMPLES = [
  "10 m square centred on this point, with points at its NE, NW, SW and SE corners",
  "3 stratified random points in each stratum, at least 20 m apart and 10 m from the edges",
  "A grid of points every 25 m inside the boundary polygon, rotated 15°",
]

export interface CartographerPanelProps {
  samplingMapId: number
  points: { id: number; label: string | null }[]
  /** The point last clicked on the map, offered as the request's focus. */
  focusPointId: number | null
  /** Draft to overlay on the map (null clears). */
  onPreview: (draft: CartographerDraft | null) => void
  onApplied: (result: { points: unknown[]; polygons: unknown[] }) => void
  onUndone: (result: { removed_point_ids: number[]; removed_polygon_ids: number[] }) => void
}

export function CartographerPanel({ samplingMapId, points, focusPointId, onPreview, onApplied, onUndone }: CartographerPanelProps) {
  const [prompt, setPrompt] = useState("")
  const [usePoint, setUsePoint] = useState(true)
  const [requests, setRequests] = useState<AgentRequestRow[]>([])
  const [previewId, setPreviewId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const previewRef = useRef<number | null>(null)
  const showDraft = useCallback(
    (draft: CartographerDraft | null) => {
      previewRef.current = draft?.id ?? null
      setPreviewId(draft?.id ?? null)
      onPreview(draft)
    },
    [onPreview],
  )

  const load = useCallback(async () => {
    const res = await fetch(`/api/agent-requests?sampling_map_id=${samplingMapId}`)
    if (!res.ok) return
    const json = await res.json()
    const rows = json.requests as AgentRequestRow[]
    setRequests(rows)
    // Show a newly arrived draft on the map automatically.
    const fresh = rows.flatMap((r) => r.Drafts).find((d) => d.status === "draft")
    if (fresh && previewRef.current == null) showDraft(fresh)
    return rows
  }, [samplingMapId, showDraft])

  // Poll while something is waiting or in progress.
  useEffect(() => {
    let alive = true
    const tick = async () => {
      const rows = await load()
      if (!alive) return
      const active = rows?.some((r) => r.status === "queued" || r.status === "claimed")
      timer.current = setTimeout(tick, active ? 3000 : 30000)
    }
    tick()
    return () => {
      alive = false
      if (timer.current) clearTimeout(timer.current)
    }
  }, [load])

  async function ask() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/agent-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sampling_map_id: samplingMapId,
          prompt,
          context: usePoint && focusPointId ? { point_id: focusPointId } : {},
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? "Couldn't send the request")
        return
      }
      setPrompt("")
      await load()
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => load(), 3000)
    } finally {
      setBusy(false)
    }
  }

  async function act(draft: CartographerDraft, action: "apply" | "discard" | "undo") {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/agent-requests/drafts/${draft.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? `Couldn't ${action} the draft`)
        return
      }
      if (action === "apply") onApplied(json)
      if (action === "undo") onUndone(json)
      if (previewId === draft.id) showDraft(null)
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function cancel(id: number) {
    await fetch(`/api/agent-requests/${id}`, { method: "DELETE" })
    await load()
  }

  function togglePreview(draft: CartographerDraft) {
    showDraft(previewId === draft.id ? null : draft)
  }

  const focusLabel = focusPointId ? points.find((p) => p.id === focusPointId)?.label ?? `Point ${focusPointId}` : null

  return (
    <div className="rounded border border-amber-200 p-2 space-y-2">
      <h3 className="text-sm font-semibold text-stone-900">Ask Cartographer</h3>
      <p className="text-xs text-stone-500">
        Describe points or shapes to add to this map. The agent drafts them; nothing changes until you apply the draft.
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        maxLength={2000}
        rows={3}
        placeholder={EXAMPLES[0]}
        className="w-full rounded-md border border-stone-200 px-2 py-1 text-sm"
      />
      {focusLabel && (
        <label className="flex items-center gap-2 text-xs text-stone-600">
          <input type="checkbox" checked={usePoint} onChange={(e) => setUsePoint(e.target.checked)} />
          About “{focusLabel}” (last point clicked)
        </label>
      )}
      <Button size="sm" className="w-full h-7 text-xs" disabled={busy || prompt.trim().length < 3} onClick={ask}>
        Ask
      </Button>
      {error && <p className="text-xs text-red-500">{error}</p>}

      {requests.length > 0 && (
        <div className="space-y-2 pt-1">
          {requests.slice(0, 8).map((r) => {
            const s = STATUS_LABEL[r.status]
            return (
              <div key={r.id} className="rounded border border-stone-200 p-2 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-stone-700">{r.prompt}</p>
                  <Badge variant={s.variant} className="shrink-0">{s.label}</Badge>
                </div>
                {r.answer && <p className="text-xs text-stone-500">{r.answer}</p>}
                {(r.status === "queued" || r.status === "claimed") && (
                  <Button size="xs" variant="ghost" className="h-6 px-1 text-xs" onClick={() => cancel(r.id)}>
                    Cancel
                  </Button>
                )}
                {r.Drafts.map((d) => (
                  <div key={d.id} className="rounded bg-stone-50 p-1.5 space-y-1">
                    <p className="text-xs text-stone-600">
                      Draft: {d.features.features.filter((f) => f.geometry.type === "Point").length} point(s)
                      {d.features.features.some((f) => f.geometry.type === "Polygon") &&
                        `, ${d.features.features.filter((f) => f.geometry.type === "Polygon").length} polygon(s)`}{" "}
                      — {d.status}
                    </p>
                    {d.explanation && <p className="text-xs text-stone-500 italic">{d.explanation}</p>}
                    <div className="flex flex-wrap gap-1">
                      {d.status === "draft" && (
                        <>
                          <Button size="xs" className="h-6 text-xs" disabled={busy} onClick={() => act(d, "apply")}>
                            Apply
                          </Button>
                          <Button size="xs" variant="outline" className="h-6 text-xs" onClick={() => togglePreview(d)}>
                            {previewId === d.id ? "Hide" : "Show"}
                          </Button>
                          <Button size="xs" variant="ghost" className="h-6 text-xs" disabled={busy} onClick={() => act(d, "discard")}>
                            Discard
                          </Button>
                        </>
                      )}
                      {d.status === "applied" && (
                        <Button size="xs" variant="ghost" className="h-6 text-xs text-red-600" disabled={busy} onClick={() => act(d, "undo")}>
                          Undo
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
