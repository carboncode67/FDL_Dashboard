import type { Bounds } from "@/lib/geo";

// Shared by the sampling-map editor (live size estimate while drawing) and
// PUT /api/sampling-maps/[id] (rejects a box that would be absurd to render),
// so the two can never disagree about what's an acceptable box.

// Matches PipelineProcessor's naip_tiles.py MIN_ZOOM/MAX_ZOOM.
export const NAIP_MIN_ZOOM = 12;
export const NAIP_MAX_ZOOM = 20;
export const NAIP_DEFAULT_MAX_ZOOM = 18; // ~0.45 m/px at NY latitudes, about NAIP's native 0.6 m
// A 1 km² box is ~80 tiles at z18, so this allows ~100 km² there, or ~6 km² at
// z20. Far beyond any one farm; it exists to stop a stray full-state box.
export const NAIP_MAX_TILES = 20_000;
// Observed NAIP JPEG tiles are ~21 KB (256 px, z17 residential); used only for the estimate.
const AVG_TILE_BYTES = 22_000;

/** Validates untrusted input as [west, south, east, north]; null if invalid. */
export function parseNaipBbox(raw: unknown): Bounds | null {
  if (!Array.isArray(raw) || raw.length !== 4 || !raw.every((n) => typeof n === "number" && Number.isFinite(n))) {
    return null;
  }
  const [w, s, e, n] = raw as number[];
  if (w < -180 || e > 180 || s < -85 || n > 85 || w >= e || s >= n) return null;
  return [w, s, e, n];
}

function lngToTileX(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** z);
}

function latToTileY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}

/** Number of XYZ tiles covering the box at one zoom level. */
export function tilesAtZoom(bbox: Bounds, z: number): number {
  const [w, s, e, n] = bbox;
  const cols = lngToTileX(e, z) - lngToTileX(w, z) + 1;
  const rows = latToTileY(s, z) - latToTileY(n, z) + 1;
  return cols * rows;
}

/** Tile count over every zoom from NAIP_MIN_ZOOM through maxZoom (what a pyramid export would contain). */
export function estimateNaipTiles(bbox: Bounds, maxZoom: number): { tiles: number; megabytes: number } {
  let tiles = 0;
  for (let z = NAIP_MIN_ZOOM; z <= maxZoom; z++) tiles += tilesAtZoom(bbox, z);
  return { tiles, megabytes: (tiles * AVG_TILE_BYTES) / 1e6 };
}
