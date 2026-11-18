"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { Sparkles, X, Paperclip, Send, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  currentEditor, emit, listen,
  type DraftFeatureCollection, type EditorAnnouncement, type GridView,
} from "@/lib/agent-chat-bridge"

/**
 * Floating "Ask an agent" chat (bottom-right on every dashboard page). Only
 * interactive agents are listed — Data Sleuth runs in the background and has no
 * chat. A Cartographer request is always about ONE attached sampling map:
 * attaching a map is how the person grants the agent access, and the agent's run
 * is bound to that map server-side (docs/cartographer-agent-plan.md §5.1a). The
 * agent only drafts; Apply is the person's own action.
 */

const AGENTS = [
  {
    kind: "cartographer",
    label: "Cartographer",
    blurb: "Draws sampling points and shapes on a map you attach.",
    needsMap: true,
  },
] as const
type AgentKind = (typeof AGENTS)[number]["kind"]

interface MapOption { id: number; name: string; farm_id: number; farm_name: string }

interface Draft {
  id: number
  status: "draft" | "applied" | "discarded" | "undone"
  explanation: string | null
  features: DraftFeatureCollection
  grids?: GridView[]
}

interface AgentRequestRow {
  id: number
  prompt: string
  status: "queued" | "claimed" | "done" | "failed" | "cancelled" | "expired"
  answer: string | null
  created_at: string
  context: { point_id?: number }
  Drafts: Draft[]
}

const STATUS: Record<AgentRequestRow["status"], { label: string; variant: "secondary" | "outline" | "destructive" }> = {
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

const STORE_KEY = "fdb.agentChat.map"

function loadStoredMap(): MapOption | null {
  try {
    const raw = sessionStorage.getItem(STORE_KEY)
    return raw ? (JSON.parse(raw) as MapOption) : null
  } catch {
    return null
  }
}
function storeMap(m: MapOption | null) {
  try {
    if (m) sessionStorage.setItem(STORE_KEY, JSON.stringify(m))
    else sessionStorage.removeItem(STORE_KEY)
  } catch {
    /* storage unavailable — attachment just won't survive a reload */
  }
}

function countFeatures(d: Draft) {
  const pts = d.features.features.filter((f) => f.geometry.type === "Point").length
  const polys = d.features.features.filter((f) => f.geometry.type === "Polygon").length
  const grids = d.grids?.length ?? 0
  const parts = [pts && `${pts} point${pts === 1 ? "" : "s"}`, polys && `${polys} polygon${polys === 1 ? "" : "s"}`].filter(Boolean).join(", ") || "empty"
  return grids ? `${parts} on ${grids === 1 ? `a ${d.grids![0].cell_size_m} m grid` : `${grids} grids`}` : parts
}

export function AgentChat() {
  const [open, setOpen] = useState(false)
  const [agent, setAgent] = useState<AgentKind>("cartographer")
  const [map, setMap] = useState<MapOption | null>(null)
  const [picking, setPicking] = useState(false)
  const [maps, setMaps] = useState<MapOption[] | null>(null)
  const [mapFilter, setMapFilter] = useState("")
  const [editor, setEditor] = useState<EditorAnnouncement | null>(null)
  const [usePoint, setUsePoint] = useState(true)
  const [prompt, setPrompt] = useState("")
  const [requests, setRequests] = useState<AgentRequestRow[]>([])
  const [previewId, setPreviewId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  // Bumped after sending: restarts the poll loop so it switches to fast polling.
  const [pollKick, setPollKick] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previewRef = useRef<number | null>(null)
  const threadEnd = useRef<HTMLDivElement | null>(null)

  const spec = AGENTS.find((a) => a.kind === agent)!
  const editorOnMap = editor && map && editor.mapId === map.id ? editor : null

  const attach = useCallback((m: MapOption | null) => {
    setMap(m)
    storeMap(m)
    setRequests([])
    setPicking(false)
    setError(null)
  }, [])

  // Restore the attachment for this tab; follow the editor's announcements.
  useEffect(() => {
    const stored = loadStoredMap()
    const ed = currentEditor()
    // Both are external state (sessionStorage, the editor's last announcement)
    // read once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setMap(stored)
    if (ed) setEditor(ed)
    const offEditor = listen("fdb:map-editor", (a) => setEditor(a))
    const offOpen = listen("fdb:agent-open", ({ mapId }) => {
      const a = currentEditor()
      setOpen(true)
      if (a && a.mapId === mapId && a.editable) {
        attach({ id: a.mapId, name: a.mapName, farm_id: a.farmId, farm_name: a.farmName })
      }
    })
    return () => {
      offEditor()
      offOpen()
    }
  }, [attach])

  const showDraft = useCallback(
    (d: Draft | null) => {
      previewRef.current = d?.id ?? null
      setPreviewId(d?.id ?? null)
      emit("fdb:agent-preview", d && map ? { mapId: map.id, draftId: d.id, features: d.features, grids: d.grids ?? [] } : null)
    },
    [map],
  )

  const load = useCallback(async () => {
    if (!map) return undefined
    const res = await fetch(`/api/agent-requests?sampling_map_id=${map.id}`)
    if (res.status === 404 || res.status === 403) {
      setError("This map is no longer available to you.")
      attach(null)
      return undefined
    }
    if (!res.ok) return undefined
    const rows = ((await res.json()).requests as AgentRequestRow[]).slice().reverse()
    setRequests(rows)
    const fresh = rows.flatMap((r) => r.Drafts).find((d) => d.status === "draft")
    if (fresh && previewRef.current == null && currentEditor()?.mapId === map.id) showDraft(fresh)
    return rows
  }, [map, attach, showDraft])

  // Poll while open: quickly while something is in flight, slowly otherwise.
  useEffect(() => {
    if (!open || !map) return
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
  }, [open, map, load, pollKick])

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: "end" })
  }, [requests.length, open])

  async function openPicker() {
    setPicking(true)
    setMapFilter("")
    if (maps) return
    const res = await fetch("/api/agent-requests/maps")
    const json = await res.json().catch(() => ({}))
    setMaps(res.ok ? (json.maps as MapOption[]) : [])
  }

  async function send() {
    if (!map || prompt.trim().length < 3) return
    setBusy(true)
    setError(null)
    try {
      const focus = editorOnMap?.focusPoint
      const res = await fetch("/api/agent-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sampling_map_id: map.id,
          prompt,
          context: usePoint && focus ? { point_id: focus.id } : {},
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? "Couldn't send the request")
        return
      }
      setPrompt("")
      // Restart the poll loop (it loads now, then every 3 s while the request is in flight).
      // Don't replace its timer with a one-shot load: that stopped polling for good.
      setPollKick((k) => k + 1)
    } finally {
      setBusy(false)
    }
  }

  async function act(d: Draft, action: "apply" | "discard" | "undo") {
    if (!map) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/agent-requests/drafts/${d.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? `Couldn't ${action} the draft`)
        return
      }
      if (action === "apply") emit("fdb:agent-applied", { mapId: map.id, points: json.points ?? [], polygons: json.polygons ?? [], grids: json.grids ?? [] })
      if (action === "undo")
        emit("fdb:agent-undone", {
          mapId: map.id,
          removed_point_ids: json.removed_point_ids ?? [],
          removed_polygon_ids: json.removed_polygon_ids ?? [],
          removed_grid_ids: json.removed_grid_ids ?? [],
        })
      if (previewRef.current === d.id) showDraft(null)
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function cancel(id: number) {
    await fetch(`/api/agent-requests/${id}`, { method: "DELETE" })
    await load()
  }

  const filteredMaps = (maps ?? []).filter((m) =>
    `${m.name} ${m.farm_name}`.toLowerCase().includes(mapFilter.trim().toLowerCase()),
  )
  const mapHref = map ? `/farms/${map.farm_id}/maps/${map.id}` : "#"

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask an agent"
        title="Ask an agent"
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-stone-900 text-white shadow-lg hover:bg-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        <Sparkles className="h-5 w-5" />
      </button>
    )
  }

  return (
    <div
      role="dialog"
      aria-label="Ask an agent"
      className="fixed bottom-5 right-5 z-40 flex max-h-[min(640px,calc(100vh-2.5rem))] w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl"
    >
      {/* Header: agent picker */}
      <div className="flex items-center gap-2 border-b border-stone-200 px-3 py-2">
        <Sparkles className="h-4 w-4 text-amber-600" />
        <select
          value={agent}
          onChange={(e) => setAgent(e.target.value as AgentKind)}
          aria-label="Agent"
          className="flex-1 rounded-md border border-stone-200 bg-white px-2 py-1 text-sm font-medium"
        >
          {AGENTS.map((a) => (
            <option key={a.kind} value={a.kind}>{a.label}</option>
          ))}
        </select>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1 text-stone-500 hover:bg-stone-100">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Attached map — the grant */}
      {spec.needsMap && (
        <div className="border-b border-stone-200 bg-stone-50 px-3 py-2 text-xs">
          {map && !picking ? (
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-stone-800">{map.name}</p>
                <p className="truncate text-stone-500">{map.farm_name} · {spec.label} can draft on this map only</p>
              </div>
              <button type="button" onClick={openPicker} className="shrink-0 text-stone-500 underline hover:text-stone-800">Change</button>
              <button type="button" onClick={() => attach(null)} className="shrink-0 text-stone-500 underline hover:text-stone-800">Detach</button>
            </div>
          ) : picking ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={mapFilter}
                  onChange={(e) => setMapFilter(e.target.value)}
                  placeholder="Find a sampling map…"
                  className="flex-1 rounded-md border border-stone-200 bg-white px-2 py-1 text-xs"
                />
                <button type="button" onClick={() => setPicking(false)} className="text-stone-500 underline">Cancel</button>
              </div>
              <div className="max-h-40 overflow-y-auto rounded border border-stone-200 bg-white">
                {maps == null ? (
                  <p className="p-2 text-stone-400">Loading…</p>
                ) : filteredMaps.length === 0 ? (
                  <p className="p-2 text-stone-400">No maps you can edit{mapFilter ? " match" : ""}.</p>
                ) : (
                  filteredMaps.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => attach(m)}
                      className="block w-full truncate px-2 py-1 text-left hover:bg-amber-50"
                    >
                      <span className="text-stone-800">{m.name}</span> <span className="text-stone-400">· {m.farm_name}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-stone-600">
                Attach a sampling map to let {spec.label} work on it. It can only draft on that one map, and nothing changes until you apply a draft.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {editor?.editable && (
                  <Button
                    size="xs"
                    className="h-6 text-xs"
                    onClick={() => attach({ id: editor.mapId, name: editor.mapName, farm_id: editor.farmId, farm_name: editor.farmName })}
                  >
                    <Paperclip className="mr-1 h-3 w-3" /> Attach “{editor.mapName}”
                  </Button>
                )}
                <Button size="xs" variant="outline" className="h-6 text-xs" onClick={openPicker}>
                  <Paperclip className="mr-1 h-3 w-3" /> {editor?.editable ? "Another map…" : "Attach a map…"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Thread */}
      <div className="min-h-[120px] flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {!map ? (
          <p className="text-xs text-stone-400">{spec.blurb}</p>
        ) : requests.length === 0 ? (
          <div className="space-y-1.5 text-xs text-stone-500">
            <p>Describe points or shapes to add. For example:</p>
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => setPrompt(ex)} className="block w-full rounded border border-stone-200 px-2 py-1 text-left hover:bg-stone-50">
                {ex}
              </button>
            ))}
          </div>
        ) : (
          requests.map((r) => {
            const s = STATUS[r.status]
            const inFlight = r.status === "queued" || r.status === "claimed"
            return (
              <div key={r.id} className="space-y-1.5">
                <div className="ml-8 rounded-lg rounded-br-sm bg-stone-900 px-2.5 py-1.5 text-xs text-white">{r.prompt}</div>
                <div className="mr-8 space-y-1.5 rounded-lg rounded-bl-sm border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-stone-700">{spec.label}</span>
                    <Badge variant={s.variant} className="shrink-0">{s.label}</Badge>
                  </div>
                  {r.answer && <p className="whitespace-pre-wrap text-stone-700">{r.answer}</p>}
                  {inFlight && (
                    <button type="button" onClick={() => cancel(r.id)} className="text-stone-500 underline">Cancel</button>
                  )}
                  {r.Drafts.map((d) => (
                    <div key={d.id} className="space-y-1 rounded border border-amber-200 bg-white p-1.5">
                      <p className="text-stone-600">
                        Draft: {countFeatures(d)} — <span className={cn(d.status === "applied" && "text-emerald-700")}>{d.status}</span>
                      </p>
                      {d.explanation && <p className="italic text-stone-500">{d.explanation}</p>}
                      <div className="flex flex-wrap gap-1">
                        {d.status === "draft" && (
                          <>
                            <Button size="xs" className="h-6 text-xs" disabled={busy} onClick={() => act(d, "apply")}>Apply</Button>
                            {editorOnMap ? (
                              <Button size="xs" variant="outline" className="h-6 text-xs" onClick={() => showDraft(previewId === d.id ? null : d)}>
                                {previewId === d.id ? "Hide on map" : "Show on map"}
                              </Button>
                            ) : (
                              <Link href={mapHref} className="inline-flex h-6 items-center rounded-md border border-stone-200 px-2 text-xs hover:bg-stone-50">
                                Open map to preview
                              </Link>
                            )}
                            <Button size="xs" variant="ghost" className="h-6 text-xs" disabled={busy} onClick={() => act(d, "discard")}>Discard</Button>
                          </>
                        )}
                        {d.status === "applied" && (
                          <Button size="xs" variant="ghost" className="h-6 text-xs text-red-600" disabled={busy} onClick={() => act(d, "undo")}>Undo</Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        )}
        <div ref={threadEnd} />
      </div>

      {/* Composer */}
      <div className="space-y-1.5 border-t border-stone-200 px-3 py-2">
        {error && <p className="text-xs text-red-600">{error}</p>}
        {editorOnMap?.focusPoint && (
          <label className="flex items-center gap-2 text-xs text-stone-600">
            <input type="checkbox" checked={usePoint} onChange={(e) => setUsePoint(e.target.checked)} />
            About “{editorOnMap.focusPoint.label}” (last point clicked)
          </label>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            disabled={!map}
            maxLength={2000}
            rows={2}
            placeholder={map ? `Ask ${spec.label}…` : "Attach a map first"}
            className="flex-1 resize-none rounded-md border border-stone-200 px-2 py-1 text-sm disabled:bg-stone-50"
          />
          <Button size="sm" className="h-8 w-8 p-0" aria-label="Send" disabled={!map || busy || prompt.trim().length < 3} onClick={send}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
