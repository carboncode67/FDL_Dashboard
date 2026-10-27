import path from "path";
import { NAIP_DEFAULT_MAX_ZOOM, NAIP_MAX_ZOOM, NAIP_MIN_ZOOM, parseNaipBbox } from "@/lib/naip-bbox";
import type { Bounds } from "@/lib/geo";

// MBTiles packages of NAIP imagery for a sampling map's bounding box — built by
// PipelineProcessor (naip_package.py), pulled down by the webhook at
// app/api/naip/packages/webhook, and served to the phone apps by
// GET /api/data/sampling-maps/[id]/basemap. One package per map.

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";
export const NAIP_PACKAGE_DIR = path.join(DATA_DIR, "naip-packages");

export function naipPackagePath(samplingMapId: number): string {
  return path.join(NAIP_PACKAGE_DIR, `${samplingMapId}.mbtiles`);
}

// A "pending" build older than this is assumed dead (processor restarted, callback
// lost) so the editor's Build button isn't stuck disabled forever.
export const NAIP_PENDING_TIMEOUT_MS = 45 * 60 * 1000;

/** The zoom ceiling for a map's package: its basemap_max_zoom setting, clamped to NAIP's servable range. */
export function naipPackageMaxZoom(basemapMaxZoom: number | null | undefined): number {
  return Math.min(Math.max(basemapMaxZoom ?? NAIP_DEFAULT_MAX_ZOOM, NAIP_MIN_ZOOM), NAIP_MAX_ZOOM);
}

interface PackageColumns {
  naip_package_sha256: string | null;
  naip_package_bytes: number | null;
  naip_package_bbox: unknown;
  naip_package_min_zoom: number | null;
  naip_package_max_zoom: number | null;
  naip_package_tiles: number | null;
  naip_package_built_at: Date | null;
}

/** What the mobile apps get under `basemap` in the map download, or null if no package exists yet. */
export function naipPackageDescriptor(samplingMapId: number, m: PackageColumns) {
  const bounds = parseNaipBbox(m.naip_package_bbox);
  if (!m.naip_package_sha256 || !bounds || m.naip_package_bytes == null) return null;
  return {
    format: "mbtiles" as const,
    url: `/api/data/sampling-maps/${samplingMapId}/basemap`,
    bytes: m.naip_package_bytes,
    sha256: m.naip_package_sha256,
    bounds,
    min_zoom: m.naip_package_min_zoom,
    max_zoom: m.naip_package_max_zoom,
    built_at: m.naip_package_built_at,
  };
}

/** The editor-facing view of a map's package state (session routes + the page's initial props). */
export interface NaipPackageState {
  status: "pending" | "ready" | "failed" | null;
  error: string | null;
  // Present when a built file exists on disk, whatever `status` says about the latest attempt.
  built: { bbox: Bounds; maxZoom: number; tiles: number; bytes: number; builtAt: string } | null;
}

export function naipPackageState(m: PackageColumns & { naip_package_status: string | null; naip_package_error: string | null; naip_package_requested_at: Date | null }): NaipPackageState {
  let status = m.naip_package_status as NaipPackageState["status"];
  if (
    status === "pending" &&
    m.naip_package_requested_at &&
    Date.now() - m.naip_package_requested_at.getTime() > NAIP_PENDING_TIMEOUT_MS
  ) {
    status = "failed";
  }
  const bbox = parseNaipBbox(m.naip_package_bbox);
  const built =
    m.naip_package_sha256 && bbox && m.naip_package_bytes != null && m.naip_package_max_zoom != null
      ? {
          bbox,
          maxZoom: m.naip_package_max_zoom,
          tiles: m.naip_package_tiles ?? 0,
          bytes: m.naip_package_bytes,
          builtAt: (m.naip_package_built_at ?? new Date(0)).toISOString(),
        }
      : null;
  return {
    status,
    error: status === "failed" ? (m.naip_package_error ?? "Build timed out — try again") : null,
    built,
  };
}
