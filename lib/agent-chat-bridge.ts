"use client"

/**
 * Window-event bridge between the floating agent chat (components/agent-chat.tsx,
 * mounted once in the dashboard layout) and the sampling-map editor, which are
 * not in the same React tree. The editor announces the map it has open and the
 * point last clicked; the chat sends draft previews to it and tells it which
 * rows an Apply/Undo added or removed so the map updates without a reload.
 */

export interface DraftFeatureCollection {
  type: "FeatureCollection"
  features: {
    type: "Feature"
    geometry: { type: "Point" | "Polygon"; coordinates: unknown }
    properties: { label?: string; purpose?: string; grid?: string; col?: number; row?: number }
  }[]
}

/** A sampling grid record (Sampling_Grids, or one on a draft keyed G1, G2…) — see lib/geo-grid.ts. */
export interface GridView {
  id?: number
  key?: string
  label: string | null
  crs: string
  origin_x: number
  origin_y: number
  cell_size_m: number
  rotation_deg: number
  seed: number | null
  params?: Record<string, unknown>
}

export interface EditorAnnouncement {
  mapId: number
  mapName: string
  farmId: number
  farmName: string
  editable: boolean
  focusPoint: { id: number; label: string } | null
}

export type BridgeEvents = {
  /** Editor → chat: the open map (null when the editor unmounts). */
  "fdb:map-editor": EditorAnnouncement | null
  /** Editor → chat: open the chat with this map attached. */
  "fdb:agent-open": { mapId: number }
  /** Chat → editor: overlay a draft (null clears). */
  "fdb:agent-preview": { mapId: number; draftId: number; features: DraftFeatureCollection; grids?: GridView[] } | null
  /** Chat → editor: rows an Apply added. */
  "fdb:agent-applied": { mapId: number; points: unknown[]; polygons: unknown[]; grids?: GridView[] }
  /** Chat → editor: rows an Undo removed. */
  "fdb:agent-undone": { mapId: number; removed_point_ids: number[]; removed_polygon_ids: number[]; removed_grid_ids?: number[] }
}

export function emit<K extends keyof BridgeEvents>(name: K, detail: BridgeEvents[K]) {
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

export function listen<K extends keyof BridgeEvents>(name: K, fn: (detail: BridgeEvents[K]) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<BridgeEvents[K]>).detail)
  window.addEventListener(name, h)
  return () => window.removeEventListener(name, h)
}

// The editor mounts before or after the chat; keep the last announcement so a
// chat that mounts later still knows the open map.
let lastAnnouncement: EditorAnnouncement | null = null
export function announceEditor(a: EditorAnnouncement | null) {
  lastAnnouncement = a
  emit("fdb:map-editor", a)
}
export function currentEditor(): EditorAnnouncement | null {
  return lastAnnouncement
}
