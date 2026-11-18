"use client"

/**
 * Sampling grids on the sampling-map editor (migration 100, lib/geo-grid.ts).
 *
 * A grid is a record, not map clutter: it's hidden by default and, when shown,
 * only the cells that were actually sampled are outlined, in thin translucent
 * lines under the points. The panel lists each grid's definition (CRS, origin,
 * cell size, rotation, seed) and copies it as JSON for analysis.
 */
import { useMemo, useState } from "react"
import { GeoJSON } from "react-leaflet"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cellRing, type GridDef } from "@/lib/geo-grid"
import type { GridView } from "@/lib/agent-chat-bridge"

export interface GridCell { col: number; row: number }

function asDef(g: GridView): GridDef {
  return { crs: g.crs, origin_x: g.origin_x, origin_y: g.origin_y, cell_size_m: g.cell_size_m, rotation_deg: g.rotation_deg, seed: g.seed ?? 0 }
}

/** Outlines of the given cells of one grid. `tone` "saved" = subtle white; "draft" = thin orange. */
export function GridCellsLayer({ grid, cells, tone }: { grid: GridView; cells: GridCell[]; tone: "saved" | "draft" }) {
  const data = useMemo(() => {
    const def = asDef(grid)
    const seen = new Set<string>()
    const polys: [number, number][][][] = []
    for (const c of cells) {
      const k = `${c.col},${c.row}`
      if (seen.has(k)) continue
      seen.add(k)
      try {
        polys.push([cellRing(def, c.col, c.row)])
      } catch {
        // an unreadable CRS on a stored grid: draw nothing rather than break the map
      }
    }
    return { type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: polys } } as GeoJSON.Feature
  }, [grid, cells])
  const style = tone === "draft"
    ? { color: "#f97316", weight: 1, opacity: 0.7, fill: false, dashArray: "3,3" }
    : { color: "#ffffff", weight: 0.75, opacity: 0.55, fill: false }
  return <GeoJSON key={`${tone}-${grid.id ?? grid.key}-${cells.length}`} data={data} style={() => style} interactive={false} />
}

function fmt(n: number, digits = 2) {
  return Number.isInteger(n) ? String(n) : n.toFixed(digits)
}

export function SamplingGridsPanel({
  grids, pointCounts, shown, onToggle,
}: {
  grids: GridView[]
  pointCounts: Map<number, number>
  shown: Set<number>
  onToggle: (id: number) => void
}) {
  const [open, setOpen] = useState<number | null>(null)
  if (!grids.length) return null
  return (
    <div className="space-y-1.5">
      <h3 className="text-sm font-semibold text-stone-900">Sampling grids ({grids.length})</h3>
      <p className="text-xs text-stone-500">The grids random grid samples were drawn from — kept so the cells can be recreated for analysis.</p>
      {grids.map((g) => {
        const id = g.id!
        const p = g.params ?? {}
        return (
          <div key={id} className="rounded border border-stone-200 p-2 text-xs space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-stone-800 truncate">{g.label ?? `Grid ${id}`}</span>
              <Button size="xs" variant={shown.has(id) ? "default" : "outline"} className="h-6 text-xs shrink-0" onClick={() => onToggle(id)}>
                {shown.has(id) ? "Hide" : "Show"}
              </Button>
            </div>
            <p className="text-stone-500">
              {fmt(g.cell_size_m)} m cells · {pointCounts.get(id) ?? 0} points
              {g.rotation_deg ? ` · rotated ${fmt(g.rotation_deg, 3)}°` : ""}
            </p>
            <button type="button" className="text-stone-500 underline" onClick={() => setOpen(open === id ? null : id)}>
              {open === id ? "Hide definition" : "Definition"}
            </button>
            {open === id && (
              <div className="space-y-1">
                <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-stone-600">
                  <dt>CRS</dt><dd className="font-mono">{g.crs}</dd>
                  <dt>Origin</dt><dd className="font-mono">{fmt(g.origin_x, 3)}, {fmt(g.origin_y, 3)}</dd>
                  <dt>Cell</dt><dd className="font-mono">{fmt(g.cell_size_m, 3)} m</dd>
                  <dt>Rotation</dt><dd className="font-mono">{fmt(g.rotation_deg, 6)}° from grid north</dd>
                  <dt>Seed</dt><dd className="font-mono">{g.seed ?? "—"}</dd>
                  {typeof p.edge_buffer_m === "number" && p.edge_buffer_m > 0 && (<><dt>Edge buffer</dt><dd className="font-mono">{p.edge_buffer_m} m</dd></>)}
                  {typeof p.algorithm === "string" && (<><dt>Method</dt><dd className="font-mono">{p.algorithm}</dd></>)}
                </dl>
                <p className="text-stone-400">Origin is the SW corner of cell (0,0); cells run east (col) and north (row) in the CRS.</p>
                <Button
                  size="xs"
                  variant="outline"
                  className="h-6 text-xs"
                  onClick={() => {
                    const { id: gid, label, crs, origin_x, origin_y, cell_size_m, rotation_deg, seed, params } = g
                    navigator.clipboard
                      .writeText(JSON.stringify({ id: gid, label, crs, origin_x, origin_y, cell_size_m, rotation_deg, seed, params }, null, 2))
                      .then(() => toast.success("Grid definition copied"), () => toast.error("Couldn't copy"))
                  }}
                >
                  Copy definition (JSON)
                </Button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
