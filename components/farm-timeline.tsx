"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import type { EventKind, FarmTimeline as Timeline, TimelineEvent } from "@/lib/farm-timeline"
import { USDM_CATEGORIES, USDM_COLORS } from "@/lib/usdm"

// The farm page timeline (docs/context-update-and-farm-timeline-plan.md §2).
// Lanes: weekly US Drought Monitor, Sentinel-2 dates, and data-collection
// events. Collapsed it shows a "Management" lane and a combined "Data" lane;
// expanded, one lane per kind. Data uploads are circles (photos red,
// recordings blue, notes green, anything else grey); management events are
// triangles coloured per operation type: hues evenly spaced around the wheel
// over the types on this farm, in an order shuffled by each name's hash (so it
// looks random but neighbours stay distinguishable; a type's colour only moves
// when the farm gains a new type). A cluster mixing types is
// drawn in a neutral ink with its count. The legend under the lanes lists
// what's on screen.
//
// - The playhead (click/drag on the drought or imagery lane, arrow keys) snaps
//   to imagery dates, else drought weeks, and drives the map's imagery layer.
//   `value`/`onChange` are unchanged from the old ContextTimeline.
// - Zoom: presets, or ⌘/Ctrl + scroll around the cursor. Pan: drag the date
//   axis, or the overview strip under it.
// - Events are bucketed by pixel width. Clicking a single event selects it (the
//   map flies to it); clicking a cluster zooms into it, or lists it once the
//   view is down to a couple of days.

const DROUGHT_CATEGORIES = USDM_CATEGORIES.filter((c) => c !== "none")
const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS
const MIN_SPAN_MS = 2 * DAY_MS
const BUCKET_PX = 9
const STORAGE_KEY = "farm-timeline-expanded"

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  management: "Management",
  photo: "Photos",
  note: "Notes",
  audio: "Recordings",
  video: "Video",
  document: "Documents",
  form: "Forms",
  drone: "Drone flights",
}
const KIND_ORDER: EventKind[] = ["management", "photo", "note", "audio", "video", "document", "form", "drone"]

// Upload circles. Kinds not listed here draw as OTHER_DATA.
const UPLOAD_STYLE: Partial<Record<string, { color: string; label: string }>> = {
  photo: { color: "#dc2626", label: "Photos" },
  audio: { color: "#2563eb", label: "Recordings" },
  note: { color: "#16a34a", label: "Notes" },
  observation: { color: "#16a34a", label: "Observations" },
}
const OTHER_DATA = "#a8a29e"
const MIXED = "#44403c"

function nameHash(s: string): number {
  let h = 2166136261
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

/** Operation type → colour, evenly spaced hues in a hash-shuffled order. */
export function managementPalette(types: Iterable<string>): Map<string, string> {
  const list = [...new Set(types)].sort((a, b) => nameHash(a) - nameHash(b) || a.localeCompare(b))
  const offset = list.length ? nameHash(list.join("|")) % 360 : 0
  // Past 8 types, alternate two lightness steps so close hues still differ.
  return new Map(
    list.map((t, i) => [t, `hsl(${Math.round(offset + (i * 360) / list.length) % 360} 70% ${list.length > 8 && i % 2 ? 32 : 44}%)`]),
  )
}

type Mark = { shape: "circle" | "triangle"; color: string; mixed: boolean }

function markFor(items: TimelineEvent[], palette: Map<string, string>): Mark {
  if (items.every((e) => e.kind === "management")) {
    const types = new Set(items.map((e) => e.subtype ?? "Management"))
    return types.size === 1
      ? { shape: "triangle", color: palette.get([...types][0]) ?? MIXED, mixed: false }
      : { shape: "triangle", color: MIXED, mixed: true }
  }
  const colors = new Set(items.map((e) => (e.kind === "management" ? MIXED : UPLOAD_STYLE[e.kind]?.color ?? OTHER_DATA)))
  return colors.size === 1 ? { shape: "circle", color: [...colors][0], mixed: false } : { shape: "circle", color: MIXED, mixed: true }
}

function MarkSvg({ mark, size, count, selected }: { mark: Mark; size: number; count: number; selected: boolean }) {
  const label = count > 1 && size >= 14 ? (count > 99 ? "99+" : String(count)) : ""
  // A surface-coloured stroke keeps neighbouring marks apart; amber when selected.
  const stroke = selected ? "stroke-amber-500" : "stroke-white"
  const sw = selected ? 2.5 : 1.5
  if (mark.shape === "triangle") {
    const s = size + 3 // triangles read smaller than circles of the same box
    return (
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden className="overflow-visible">
        <polygon
          points={`${s / 2},${sw} ${s - sw},${s - sw} ${sw},${s - sw}`}
          fill={mark.color}
          className={stroke}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
        {label && (
          <text x={s / 2} y={s * 0.72} textAnchor="middle" fontSize="8" fontWeight="600" fill="white">
            {label}
          </text>
        )}
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="overflow-visible">
      <circle cx={size / 2} cy={size / 2} r={size / 2 - sw / 2} fill={mark.color} className={stroke} strokeWidth={sw} />
      {label && (
        <text x={size / 2} y={size / 2 + 3} textAnchor="middle" fontSize="9" fontWeight="600" fill="white">
          {label}
        </text>
      )}
    </svg>
  )
}

const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`)
const fmtDay = (t: number, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) =>
  new Date(t).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" })

function axisTicks(vs: number, ve: number, widthPx: number): { at: number; label: string }[] {
  const span = ve - vs
  const maxLabels = Math.max(2, Math.floor(widthPx / 72))
  const out: { at: number; label: string }[] = []
  const s = new Date(vs)
  if (span > 900 * DAY_MS) {
    for (let y = s.getUTCFullYear() + 1; Date.UTC(y, 0, 1) <= ve; y++) out.push({ at: Date.UTC(y, 0, 1), label: String(y) })
  } else if (span > 75 * DAY_MS) {
    const months: number[] = []
    for (let d = Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 1); d <= ve; ) {
      months.push(d)
      const n = new Date(d)
      d = Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1)
    }
    const step = Math.max(1, Math.ceil(months.length / maxLabels))
    months
      .filter((_, i) => i % step === 0)
      .forEach((at, i) => {
        const d = new Date(at)
        const withYear = i === 0 || d.getUTCMonth() < step
        out.push({ at, label: fmtDay(at, { month: "short", ...(withYear ? { year: "numeric" } : {}) }) })
      })
  } else {
    const unit = span > 20 * DAY_MS ? WEEK_MS : DAY_MS
    // Weeks start on Monday (1970-01-05 was one).
    const first = unit === WEEK_MS ? Math.ceil((vs - 4 * DAY_MS) / WEEK_MS) * WEEK_MS + 4 * DAY_MS : Math.ceil(vs / DAY_MS) * DAY_MS
    const all: number[] = []
    for (let t = first; t <= ve; t += unit) all.push(t)
    const step = Math.max(1, Math.ceil(all.length / maxLabels))
    all.filter((_, i) => i % step === 0).forEach((at) => out.push({ at, label: fmtDay(at, { month: "short", day: "numeric" }) }))
  }
  // Labels are centred on their tick; drop any too close to either edge.
  const margin = span * 0.03
  return out.filter((t) => t.at - vs > margin && ve - t.at > margin)
}

interface Bucket {
  idx: number
  from: number
  to: number
  items: TimelineEvent[]
}

function bucketize(events: TimelineEvent[], vs: number, ve: number, n: number): Bucket[] {
  const size = (ve - vs) / n
  const map = new Map<number, Bucket>()
  for (const e of events) {
    const t = Date.parse(e.at)
    if (t < vs || t > ve) continue
    const idx = Math.min(n - 1, Math.floor((t - vs) / size))
    let b = map.get(idx)
    if (!b) map.set(idx, (b = { idx, from: vs + idx * size, to: vs + (idx + 1) * size, items: [] }))
    b.items.push(e)
  }
  return [...map.values()]
}

function readExpanded(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

export interface FarmTimelineProps {
  timeline: Timeline
  // Imagery playhead date (YYYY-MM-DD), owned by the map.
  value: string | null
  onChange: (date: string) => void
  selectedEventId: string | null
  onSelectEvent: (e: TimelineEvent | null) => void
}

export function FarmTimeline({ timeline, value, onChange, selectedEventId, onSelectEvent }: FarmTimelineProps) {
  // Presets: All = first data point − 1 month → today; 1 yr = the last 360
  // days; Season = Jan 1 → today. The pannable extent covers all three, plus
  // anything dated after today.
  const [todayEnd] = useState(() => {
    const n = new Date()
    return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1)
  })
  const rawStart = dayMs(timeline.start)
  const rawEnd = Math.max(dayMs(timeline.end) + DAY_MS, rawStart + DAY_MS)
  const first = new Date(rawStart)
  const allStart = Date.UTC(first.getUTCFullYear(), first.getUTCMonth() - 1, first.getUTCDate())
  const yearStart = todayEnd - 360 * DAY_MS
  const seasonStart = Date.UTC(new Date(todayEnd - DAY_MS).getUTCFullYear(), 0, 1)
  const fullStart = Math.min(allStart, yearStart, seasonStart)
  const fullEnd = Math.max(todayEnd, rawEnd)
  const presetView = (kind: "all" | "year" | "season"): [number, number] =>
    kind === "year" ? [yearStart, todayEnd] : kind === "season" ? [seasonStart, todayEnd] : [allStart, fullEnd]

  const [expanded, setExpanded] = useState(readExpanded)
  const [view, setView] = useState<[number, number]>(() => presetView("all"))
  const [width, setWidth] = useState(600)
  const [hover, setHover] = useState<{ lane: string; bucket: Bucket } | null>(null)
  const [pickList, setPickList] = useState<TimelineEvent[] | null>(null)

  const trackRef = useRef<HTMLDivElement>(null)
  const ctxRef = useRef<HTMLDivElement>(null)
  const [vs, ve] = view
  const span = ve - vs
  const pctOf = (t: number) => ((t - vs) / span) * 100
  const pct = (t: number) => `${Math.min(Math.max(pctOf(t), 0), 100).toFixed(3)}%`
  const inView = (t: number) => t >= vs && t <= ve

  const clamp = useCallback(
    (a: number, b: number): [number, number] => {
      let s = Math.min(a, b)
      let e = Math.max(a, b)
      if (e - s < MIN_SPAN_MS) {
        const mid = (s + e) / 2
        s = mid - MIN_SPAN_MS / 2
        e = mid + MIN_SPAN_MS / 2
      }
      const len = Math.min(e - s, fullEnd - fullStart)
      if (s < fullStart) [s, e] = [fullStart, fullStart + len]
      if (e > fullEnd) [s, e] = [fullEnd - len, fullEnd]
      return [s, e]
    },
    [fullStart, fullEnd],
  )

  function toggleExpanded() {
    setExpanded((v) => {
      try {
        localStorage.setItem(STORAGE_KEY, v ? "0" : "1")
      } catch {
        /* storage unavailable — fine, it just won't be remembered */
      }
      return !v
    })
  }

  // Track width for bucketing and tick density.
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(200, entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ⌘/Ctrl + wheel zoom. Native listener: React's wheel handler is passive.
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const f = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
      setView(([s, en]) => {
        const at = s + f * (en - s)
        const k = e.deltaY > 0 ? 1.25 : 0.8
        return clamp(at - f * (en - s) * k, at + (1 - f) * (en - s) * k)
      })
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [clamp])

  // ----- playhead (imagery / drought) -----
  const stops = (timeline.imagery.length ? timeline.imagery : timeline.drought).map((s) => s.date)
  const selected = value ?? stops[stops.length - 1] ?? null
  const selectedIdx = selected ? stops.indexOf(selected) : -1

  function snapTo(clientX: number) {
    const el = ctxRef.current
    if (!el || stops.length === 0) return
    const rect = el.getBoundingClientRect()
    const t = vs + ((clientX - rect.left) / rect.width) * span
    let best = stops[0]
    for (const s of stops) if (Math.abs(dayMs(s) - t) < Math.abs(dayMs(best) - t)) best = s
    if (best !== selected) onChange(best)
  }
  function onCtxPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    snapTo(e.clientX)
  }
  function onCtxPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) snapTo(e.clientX)
  }
  function onCtxKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (stops.length === 0) return
    const i = selectedIdx < 0 ? stops.length - 1 : selectedIdx
    const next =
      e.key === "ArrowLeft" || e.key === "ArrowDown" ? Math.max(0, i - 1)
      : e.key === "ArrowRight" || e.key === "ArrowUp" ? Math.min(stops.length - 1, i + 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? stops.length - 1
      : null
    if (next == null) return
    e.preventDefault()
    onChange(stops[next])
  }

  // ----- pan by dragging the axis / overview -----
  const panRef = useRef<{ x: number; view: [number, number]; scale: number } | null>(null)
  function startPan(e: PointerEvent<HTMLDivElement>, overview: boolean) {
    e.currentTarget.setPointerCapture(e.pointerId)
    const w = e.currentTarget.getBoundingClientRect().width
    // Dragging the axis moves the content with the pointer; dragging the
    // overview window moves the window (opposite sign, full-range scale).
    const scale = overview ? -(fullEnd - fullStart) / w : span / w
    panRef.current = { x: e.clientX, view, scale }
  }
  function movePan(e: PointerEvent<HTMLDivElement>) {
    const p = panRef.current
    if (!p || !e.currentTarget.hasPointerCapture(e.pointerId)) return
    const d = (e.clientX - p.x) * p.scale
    setView(clamp(p.view[0] - d, p.view[1] - d))
  }
  const endPan = () => (panRef.current = null)

  function preset(kind: "all" | "year" | "season") {
    setPickList(null)
    setView(presetView(kind))
  }



  // ----- event lanes -----
  const nBuckets = Math.max(20, Math.floor(width / BUCKET_PX))
  const palette = useMemo(
    () => managementPalette(timeline.events.filter((e) => e.kind === "management").map((e) => e.subtype ?? "Management")),
    [timeline.events],
  )
  const lanes = useMemo(() => {
    const present = KIND_ORDER.filter((k) => timeline.events.some((e) => e.kind === k))
    if (!present.length) return []
    if (!expanded) {
      const mgmt = timeline.events.filter((e) => e.kind === "management")
      const data = timeline.events.filter((e) => e.kind !== "management")
      return [
        ...(mgmt.length ? [{ key: "management", label: EVENT_KIND_LABELS.management, events: mgmt }] : []),
        ...(data.length ? [{ key: "data", label: "Data", events: data }] : []),
      ]
    }
    return present.map((k) => ({ key: k, label: EVENT_KIND_LABELS[k], events: timeline.events.filter((e) => e.kind === k) }))
  }, [timeline.events, expanded])

  function clickBucket(b: Bucket) {
    if (b.items.length === 1) {
      setPickList(null)
      onSelectEvent(b.items[0])
      return
    }
    // A cluster lists its events; zooming stays with the presets and
    // ⌘/Ctrl + scroll, so a click never drops the view to a few days.
    setPickList(b.items)
  }


  const selectedEvent = selectedEventId ? timeline.events.find((e) => e.id === selectedEventId) ?? null : null
  const laneLabelW = "w-24 shrink-0"
  const hasContextLanes = timeline.drought.length > 0 || timeline.imagery.length > 0
  const ticks = axisTicks(vs, ve, width)

  return (
    <div className="space-y-1.5 px-1 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="text-stone-500">
          Timeline <span className="text-stone-400">· {fmtDay(vs)} – {fmtDay(ve - 1)}</span>
        </span>
        <div className="flex items-center gap-1 text-xs">
          {selected && hasContextLanes && <span className="mr-2 font-medium text-stone-700">{fmtDay(dayMs(selected))}</span>}
          {(["season", "year", "all"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => preset(p)}
              className="rounded border border-stone-200 px-1.5 py-0.5 text-stone-600 hover:bg-stone-100"
            >
              {p === "season" ? "Season" : p === "year" ? "1 yr" : "All"}
            </button>
          ))}
          <button
            type="button"
            onClick={toggleExpanded}
            aria-expanded={expanded}
            className="ml-1 rounded border border-stone-200 px-1.5 py-0.5 text-stone-600 hover:bg-stone-100"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      <div className="flex">
        {/* lane labels */}
        <div className={`${laneLabelW} pr-2 text-right text-xs text-stone-500`}>
          {timeline.drought.length > 0 && <div className={expanded ? "flex h-9 items-center justify-end" : "flex h-7 items-center justify-end"}>Drought</div>}
          {timeline.imagery.length > 0 && <div className="flex h-5 items-center justify-end">Imagery</div>}
          {lanes.map((l) => (
            <div key={l.key} className={`flex items-center justify-end ${expanded ? "h-7" : "h-6"}`}>
              {l.label}
            </div>
          ))}
        </div>

        <div ref={trackRef} className="relative min-w-0 flex-1 select-none">
          {/* context lanes: playhead interaction */}
          {hasContextLanes && (
            <div
              ref={ctxRef}
              role="slider"
              tabIndex={0}
              aria-label="Imagery date"
              aria-valuemin={fullStart}
              aria-valuemax={fullEnd}
              aria-valuenow={selected ? dayMs(selected) : undefined}
              aria-valuetext={selected ? fmtDay(dayMs(selected)) : undefined}
              className="relative cursor-pointer touch-none rounded outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
              onPointerDown={onCtxPointerDown}
              onPointerMove={onCtxPointerMove}
              onKeyDown={onCtxKeyDown}
            >
              {timeline.drought.length > 0 && (
                <div className={`relative overflow-hidden rounded-sm bg-stone-100 ${expanded ? "h-9" : "h-7"}`}>
                  {timeline.drought.map((w, i) => {
                    const from = dayMs(w.date)
                    const next = timeline.drought[i + 1]
                    const to = Math.min(next ? dayMs(next.date) : from + WEEK_MS, from + WEEK_MS)
                    if (to < vs || from > ve) return null
                    return (
                      <div
                        key={w.date}
                        className="absolute inset-y-0"
                        style={{ left: pct(from), width: `calc(${pct(to)} - ${pct(from)})`, backgroundColor: USDM_COLORS[w.dominant] }}
                        title={`Week of ${fmtDay(from)}`}
                      >
                        {w.mixed && <span className="absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-stone-800/60" />}
                      </div>
                    )
                  })}
                </div>
              )}
              {timeline.imagery.length > 0 && (
                <div className="relative h-5 border-b border-stone-200">
                  {timeline.imagery.filter((f) => inView(dayMs(f.date))).map((f) => (
                    <div
                      key={f.rasterId}
                      className="absolute top-1 bottom-0 w-px bg-stone-500"
                      style={{ left: pct(dayMs(f.date)) }}
                      title={`${f.product} · ${fmtDay(dayMs(f.date))}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* event lanes */}
          {lanes.map((l) => (
            <div key={l.key} className={`relative border-b border-stone-100 ${expanded ? "h-7" : "h-6"}`}>
              <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-stone-200" />
              {bucketize(l.events, vs, ve, nBuckets).map((b) => {
                const n = b.items.length
                const size = n === 1 ? 10 : Math.min(20, 11 + Math.log2(n) * 2.5)
                const mark = markFor(b.items, palette)
                const isSel = !!selectedEventId && b.items.some((e) => e.id === selectedEventId)
                const center = ((b.idx + 0.5) / nBuckets) * 100
                return (
                  <button
                    key={b.idx}
                    type="button"
                    aria-label={n === 1 ? `${b.items[0].label}, ${fmtDay(Date.parse(b.items[0].at))}` : `${n} events around ${fmtDay(b.from)}`}
                    className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-stone-500"
                    style={{ left: `${center}%`, width: Math.max(size, 16), height: 22 }}
                    onClick={() => clickBucket(b)}
                    onPointerEnter={() => setHover({ lane: l.key, bucket: b })}
                    onPointerLeave={() => setHover((h) => (h?.bucket === b ? null : h))}
                    onFocus={() => setHover({ lane: l.key, bucket: b })}
                    onBlur={() => setHover(null)}
                  >
                    <MarkSvg mark={mark} size={size} count={n} selected={isSel} />
                  </button>
                )
              })}
              {hover?.lane === l.key && <Tooltip bucket={hover.bucket} leftPct={((hover.bucket.idx + 0.5) / nBuckets) * 100} />}
            </div>
          ))}

          {/* axis — drag to pan */}
          <div
            className="relative h-5 cursor-grab touch-none text-[11px] text-stone-500 active:cursor-grabbing"
            onPointerDown={(e) => startPan(e, false)}
            onPointerMove={movePan}
            onPointerUp={endPan}
            title="Drag to pan · ⌘/Ctrl + scroll to zoom"
          >
            {ticks.map((t) => (
              <span key={t.at} className="absolute top-1 -translate-x-1/2 whitespace-nowrap" style={{ left: pct(t.at) }}>
                {t.label}
              </span>
            ))}
          </div>

          {/* overview strip: where the view sits in the whole extent; drag to pan */}
          {(
            <div
              className="relative mt-0.5 h-2 cursor-grab touch-none rounded-full bg-stone-100"
              onPointerDown={(e) => startPan(e, true)}
              onPointerMove={movePan}
              onPointerUp={endPan}
              aria-hidden
            >
              <div
                className="absolute inset-y-0 rounded-full bg-stone-400"
                style={{
                  left: `${((vs - fullStart) / (fullEnd - fullStart)) * 100}%`,
                  width: `${Math.max(1, (span / (fullEnd - fullStart)) * 100)}%`,
                }}
              />
            </div>
          )}

          {/* playhead */}
          {selected && hasContextLanes && inView(dayMs(selected)) && (
            <div className="pointer-events-none absolute -top-1 bottom-5" style={{ left: pct(dayMs(selected)) }}>
              <div className="absolute inset-y-0 -translate-x-1/2 border-l-2 border-stone-800" />
              <div className="absolute -top-0.5 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-stone-800" />
            </div>
          )}

        </div>
      </div>

      {timeline.capped && (
        <p className="text-xs text-stone-500">Showing the most recent events only — older ones are left off this farm&apos;s timeline.</p>
      )}

      {pickList && (
        <div className="rounded-md border border-stone-200 p-2 text-sm">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-stone-500">{pickList.length} events</span>
            <button type="button" className="text-xs text-stone-500 underline" onClick={() => setPickList(null)}>
              Close
            </button>
          </div>
          <ul className="max-h-40 space-y-0.5 overflow-y-auto">
            {pickList.map((e) => (
              <li key={e.id}>
                <button type="button" className="text-left hover:underline" onClick={() => onSelectEvent(e)}>
                  {e.label} <span className="text-stone-400">· {new Date(e.at).toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectedEvent && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
          <span className="font-medium text-stone-800">{selectedEvent.label}</span>
          <span className="text-stone-500">{new Date(selectedEvent.at).toLocaleString()}</span>
          {selectedEvent.detail && <span className="text-stone-700">{selectedEvent.detail}</span>}
          <span className="ml-auto flex gap-3 text-xs">
            {selectedEvent.lat == null && <span className="text-stone-400">No location</span>}
            {selectedEvent.href && (
              <a className="underline underline-offset-2" href={selectedEvent.href} target="_blank" rel="noreferrer">
                Open
              </a>
            )}
            <button type="button" className="text-stone-500 underline" onClick={() => onSelectEvent(null)}>
              Clear
            </button>
          </span>
        </div>
      )}

<EventLegend timeline={timeline} palette={palette} />

      {timeline.drought.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-600">
          <span className="text-stone-500">US Drought Monitor:</span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: USDM_COLORS.none }} />
            No Drought
          </span>
          <span className="flex items-center gap-1.5">
            Moderate
            <span className="flex">
              {DROUGHT_CATEGORIES.map((c) => (
                <span key={c} className="inline-block h-3 w-4" style={{ backgroundColor: USDM_COLORS[c] }} />
              ))}
            </span>
            Severe
          </span>
          {timeline.drought.some((w) => w.mixed) && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-stone-800/60" />
              Varies across area
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function Tooltip({ bucket, leftPct }: { bucket: Bucket; leftPct: number }) {
  const items = [...bucket.items].sort((a, b) => a.at.localeCompare(b.at))
  const first = Date.parse(items[0].at)
  const last = Date.parse(items[items.length - 1].at)
  const sameDay = new Date(first).toISOString().slice(0, 10) === new Date(last).toISOString().slice(0, 10)
  // Keep the box inside the track near either edge.
  const align = leftPct < 20 ? "translate-x-0" : leftPct > 80 ? "-translate-x-full" : "-translate-x-1/2"
  return (
    <div
      role="tooltip"
      className={`pointer-events-none absolute bottom-full z-[500] mb-1 w-64 rounded-md border border-stone-200 bg-white p-2 text-xs shadow-md ${align}`}
      style={{ left: `${leftPct}%` }}
    >
      <div className="mb-1 font-medium text-stone-700">
        {items.length === 1
          ? new Date(first).toLocaleString()
          : sameDay
            ? `${items.length} events · ${fmtDay(first)}`
            : `${items.length} events · ${fmtDay(first)} – ${fmtDay(last)}`}
      </div>
      <ul className="space-y-0.5 text-stone-600">
        {items.slice(0, 5).map((e) => (
          <li key={e.id} className="truncate">
            {e.label}
            {e.detail ? <span className="text-stone-400"> · {e.detail}</span> : null}
          </li>
        ))}
        {items.length > 5 && <li className="text-stone-400">+{items.length - 5} more{items.length > 1 ? " — click to zoom in" : ""}</li>}
      </ul>
    </div>
  )
}

function LegendMark({ shape, color }: { shape: "circle" | "triangle"; color: string }) {
  return <MarkSvg mark={{ shape, color, mixed: false }} size={10} count={1} selected={false} />
}

/** Every mark style currently in the timeline, plus the Sentinel-2 pass line. */
function EventLegend({ timeline, palette }: { timeline: Timeline; palette: Map<string, string> }) {
  const uploads: { color: string; label: string }[] = []
  let other = false
  const seen = new Set<string>()
  const mgmtTypes = new Set<string>()
  for (const e of timeline.events) {
    if (e.kind === "management") {
      mgmtTypes.add(e.subtype ?? "Management")
      continue
    }
    const st = UPLOAD_STYLE[e.kind]
    if (!st) other = true
    else if (!seen.has(st.label)) {
      seen.add(st.label)
      uploads.push(st)
    }
  }
  const order = ["Photos", "Recordings", "Notes", "Observations"]
  uploads.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label))
  const types = [...mgmtTypes].sort((a, b) => a.localeCompare(b))
  if (!uploads.length && !other && !types.length && !timeline.imagery.length) return null
  return (
    <div className="space-y-1 text-xs text-stone-600">
      {(uploads.length > 0 || other || timeline.imagery.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-stone-500">Data:</span>
          {uploads.map((u) => (
            <span key={u.label} className="flex items-center gap-1.5">
              <LegendMark shape="circle" color={u.color} />
              {u.label}
            </span>
          ))}
          {other && (
            <span className="flex items-center gap-1.5">
              <LegendMark shape="circle" color={OTHER_DATA} />
              Other (forms, samples, files…)
            </span>
          )}
          {timeline.imagery.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-px bg-stone-500" />
              Sentinel-2 pass
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <LegendMark shape="circle" color={MIXED} />
            Several types (zoom in)
          </span>
        </div>
      )}
      {types.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-stone-500">Management:</span>
          {types.map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <LegendMark shape="triangle" color={palette.get(t) ?? MIXED} />
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
