"use client"

import { useRef, type KeyboardEvent, type PointerEvent } from "react"
import type { ContextTimeline as Timeline } from "@/lib/context-timeline"
import { USDM_CATEGORIES, USDM_COLORS } from "@/lib/usdm"

const DROUGHT_CATEGORIES = USDM_CATEGORIES.filter((c) => c !== "none")
const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS

const ms = (d: string) => Date.parse(`${d}T00:00:00Z`)
const fmt = (d: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) =>
  new Date(ms(d)).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" })

function monthTicks(startMs: number, endMs: number): { at: number; label: string }[] {
  const s = new Date(startMs)
  const months: number[] = []
  for (let d = Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 1); d <= endMs; ) {
    months.push(d)
    const n = new Date(d)
    d = Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1)
  }
  const step = Math.max(1, Math.ceil(months.length / 8))
  // Labels are centred on their tick, so drop any too close to either end to fit.
  const margin = (endMs - startMs) * 0.03
  return months
    .filter((_, i) => i % step === 0)
    .filter((at) => at - startMs > margin && endMs - at > margin)
    .map((at, i) => {
      const d = new Date(at)
      const withYear = i === 0 || d.getUTCMonth() < step
      return { at, label: d.toLocaleDateString(undefined, { month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" }) }
    })
}

export interface ContextTimelineProps {
  timeline: Timeline
  // Selected date (YYYY-MM-DD) — owned by the map so an imagery layer can
  // follow the same playhead.
  value: string | null
  onChange: (date: string) => void
}

/**
 * Shared time axis for the farm's spatial context: a weekly US Drought Monitor
 * strip, an imagery-date track (when dated imagery has been pulled) and one
 * playhead across both. The playhead snaps to imagery dates when there are
 * any, otherwise to drought weeks.
 */
export function ContextTimeline({ timeline, value, onChange }: ContextTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const startMs = ms(timeline.start)
  const endMs = Math.max(ms(timeline.end) + DAY_MS, startMs + DAY_MS)
  const span = endMs - startMs
  const pct = (t: number) => `${(Math.min(Math.max((t - startMs) / span, 0), 1) * 100).toFixed(3)}%`

  const stops = (timeline.imagery.length ? timeline.imagery : timeline.drought).map((s) => s.date)
  const selected = value ?? stops[stops.length - 1] ?? null
  const selectedIdx = selected ? stops.indexOf(selected) : -1

  function snapTo(clientX: number) {
    const el = trackRef.current
    if (!el || stops.length === 0) return
    const rect = el.getBoundingClientRect()
    const t = startMs + ((clientX - rect.left) / rect.width) * span
    let best = stops[0]
    for (const s of stops) if (Math.abs(ms(s) - t) < Math.abs(ms(best) - t)) best = s
    if (best !== selected) onChange(best)
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    snapTo(e.clientX)
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) snapTo(e.clientX)
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
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

  return (
    <div className="space-y-1.5 px-1 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-stone-500">
          Timeline <span className="text-stone-400">· {fmt(timeline.start)} – {fmt(timeline.end)}</span>
        </span>
        {selected && (
          <span className="text-xs font-medium text-stone-700">{fmt(selected)}</span>
        )}
      </div>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Timeline date"
        aria-valuemin={startMs}
        aria-valuemax={endMs}
        aria-valuenow={selected ? ms(selected) : undefined}
        aria-valuetext={selected ? fmt(selected) : undefined}
        className="relative cursor-pointer touch-none select-none rounded outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
      >
        {timeline.drought.length > 0 && (
          <div className="relative h-7 overflow-hidden rounded-sm bg-stone-100">
            {timeline.drought.map((w, i) => {
              const from = ms(w.date)
              const next = timeline.drought[i + 1]
              const to = Math.min(next ? ms(next.date) : from + WEEK_MS, from + WEEK_MS, endMs)
              // One solid colour per week (the area's dominant category); a
              // week that varies across the area gets a dot instead of a split.
              return (
                <div
                  key={w.date}
                  className="absolute inset-y-0"
                  style={{ left: pct(from), width: `calc(${pct(to)} - ${pct(from)})`, backgroundColor: USDM_COLORS[w.dominant] }}
                  title={`Week of ${fmt(w.date)}`}
                >
                  {w.mixed && <span className="absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-stone-800/60" />}
                </div>
              )
            })}
          </div>
        )}

        {timeline.imagery.length > 0 && (
          <div className="relative mt-1 h-4 border-b border-stone-200">
            {timeline.imagery.map((f) => (
              <div
                key={f.rasterId}
                className="absolute top-0.5 bottom-0 w-px bg-stone-500"
                style={{ left: pct(ms(f.date)) }}
                title={`${f.product} · ${fmt(f.date)}`}
              />
            ))}
          </div>
        )}

        <div className="relative h-4 text-[11px] text-stone-500">
          {monthTicks(startMs, endMs).map((t) => (
            <span key={t.at} className="absolute top-0.5 -translate-x-1/2 whitespace-nowrap" style={{ left: pct(t.at) }}>
              {t.label}
            </span>
          ))}
        </div>

        {selected && (
          <div className="pointer-events-none absolute -top-1 bottom-4" style={{ left: pct(ms(selected)) }}>
            <div className="absolute inset-y-0 -translate-x-1/2 border-l-2 border-stone-800" />
            <div className="absolute -top-0.5 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-stone-800" />
          </div>
        )}
      </div>

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
