"use client";

// Full-resolution ortho chips for the vision label checker and detection
// review (GET /api/vision/[jobId]/sources/[sourceId]/chip → PipelineProcessor
// vision_sources.py). The basemap tile pyramid stops short of a drone ortho's
// own resolution, so each item gets a chip cut from the original ortho and
// shown in its own pane between the tiles and the markers.

import L from "leaflet";

export type Chip = { url: string; bounds: L.LatLngBoundsExpression };
export type ChipResult = Chip | "preparing" | null;

export const CHIP_PANE = "chips";
export const MAX_ZOOM = 25;
const CACHE = 24;

/** Ground width of a chip: a few object widths (at least 3 m, at most 20 m). */
export function chipSize(objectSize: number | null, minMeters = 0): number {
  return Math.min(20, Math.max(3, (objectSize ?? 0.5) * 8, minMeters));
}

/** Zoom at which `px` screen pixels span `meters` of ground at this latitude. */
export function zoomFor(lat: number, meters: number, px: number, minZoom: number | null): number {
  const z = Math.log2((156543.03 * Math.cos((lat * Math.PI) / 180) * px) / meters);
  return Math.max(minZoom ?? 12, Math.min(MAX_ZOOM, Math.round(z * 2) / 2));
}

/** Adds the chip pane (above tiles at 200, below vectors/markers at 400+). */
export function addChipPane(map: L.Map) {
  map.createPane(CHIP_PANE).style.zIndex = "350";
}

/** Fetches and caches chips for one ortho source of a job. */
export class ChipLoader {
  private cache = new Map<string, Promise<ChipResult>>();
  constructor(private jobId: number, private sourceId: number) {}

  get(lat: number, lng: number, size: number): Promise<ChipResult> {
    const key = `${lat.toFixed(7)},${lng.toFixed(7)},${size}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const p = (async (): Promise<ChipResult> => {
      try {
        const res = await fetch(`/api/vision/${this.jobId}/sources/${this.sourceId}/chip?lon=${lng}&lat=${lat}&size_m=${size}`);
        if (res.status === 202) return "preparing";
        if (!res.ok) return null;
        const [w, s, e, n] = (res.headers.get("x-chip-bounds") ?? "").split(",").map(Number);
        if (![w, s, e, n].every(Number.isFinite)) return null;
        return { url: URL.createObjectURL(await res.blob()), bounds: [[s, w], [n, e]] };
      } catch {
        return null;
      }
    })();
    this.cache.set(key, p);
    // A "preparing" or failed answer isn't kept, so the next ask tries again.
    void p.then((c) => { if (c === "preparing" || c === null) this.cache.delete(key); });
    while (this.cache.size > CACHE) {
      const oldest = this.cache.keys().next().value as string;
      void this.cache.get(oldest)!.then((c) => { if (c && c !== "preparing") URL.revokeObjectURL(c.url); });
      this.cache.delete(oldest);
    }
    return p;
  }

  dispose() {
    for (const p of this.cache.values()) void p.then((c) => { if (c && c !== "preparing") URL.revokeObjectURL(c.url); });
    this.cache.clear();
  }
}

export const PREPARING_NOTE =
  "Preparing full-resolution imagery: the processing machine is downloading this ortho (once; a few minutes for a large file). Showing the low-resolution map tiles until then.";

/**
 * Shows the chip around lat/lng in `layer`, retrying every 5 s while the
 * processor is still downloading the ortho. Returns a cancel function.
 */
export function showChip(
  layer: L.LayerGroup, loader: ChipLoader, lat: number, lng: number, size: number,
  onNote: (note: string | null) => void,
): () => void {
  let live = true;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const attempt = () => {
    void loader.get(lat, lng, size).then((c) => {
      if (!live) return;
      if (c === "preparing") {
        onNote(PREPARING_NOTE);
        retry = setTimeout(attempt, 5000);
        return;
      }
      onNote(c ? null : "Couldn't load the full-resolution image here; showing the map tiles.");
      layer.clearLayers();
      if (c) L.imageOverlay(c.url, c.bounds, { pane: CHIP_PANE, interactive: false }).addTo(layer);
    });
  };
  onNote("Loading full-resolution image…");
  attempt();
  return () => { live = false; if (retry) clearTimeout(retry); };
}
