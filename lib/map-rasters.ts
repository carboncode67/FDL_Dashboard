import type { MapRaster } from "@/components/map-raster-layers";

// Factored out of app/(dashboard)/farms/[id]/page.tsx and
// app/(dashboard)/farms/[id]/maps/[mapId]/page.tsx (items 6+7,
// docs/raster-tiling-plan.md §6) — both pages build a MapRaster[] for the
// same FarmMap/SamplingMapEditor raster checklist, now from two source
// tables instead of one.

export function pipelineOutputToMapRaster(r: {
  id: number;
  filename: string;
  original_filename: string;
  kind: string;
  crs_status: string | null;
  Run: { Pipeline: { name: string } };
}): MapRaster {
  return {
    id: r.id,
    source: "pipeline",
    url: `/api/files/pipeline-outputs/${r.filename}`,
    // Pairs the pipeline name with the original output filename since one run
    // can produce several (one GeoTIFF per interpolated column).
    label: `${r.Run.Pipeline.name} — ${r.original_filename}`,
    kind: r.kind === "vector" ? "vector" : "raster",
    crsStatus: r.crs_status === "ok" ? "ok" : r.crs_status === "unclear" ? "unclear" : null,
  };
}

// Only ever called on a `tiling_status: "ready"` row — callers filter that at
// the query level, same as maps/[mapId]/page.tsx pre-filtering
// PipelineOutputRasters to crs_status != "unclear".
export function basemapToMapRaster(b: {
  id: number;
  original_filename: string;
  display_name?: string | null;
  source_filename: string;
  crs_status: string | null;
  footprint: unknown;
  min_zoom: number | null;
  max_zoom: number | null;
  updated_at?: Date;
}): MapRaster {
  return {
    id: b.id,
    source: "basemap",
    // ?v= busts the tile route's 24 h browser cache after a re-tile, which
    // rewrites the tiles in place under the same {z}/{x}/{y} paths.
    url: `/api/basemaps/${b.id}/tiles/{z}/{x}/{y}.png${b.updated_at ? `?v=${b.updated_at.getTime()}` : ""}`,
    // Not `url` (a tile template, not downloadable) — the "CRS unclear" link
    // in farm-map.tsx needs an actual single-file URL, same reasoning as the
    // downloadUrl doc comment on MapRaster.
    downloadUrl: `/api/files/basemap-sources/${b.source_filename}`,
    label: b.display_name || b.original_filename,
    kind: "raster",
    crsStatus: b.crs_status === "ok" ? "ok" : b.crs_status === "unclear" ? "unclear" : null,
    footprint: (b.footprint as GeoJSON.Polygon | null) ?? null,
    minZoom: b.min_zoom,
    maxZoom: b.max_zoom,
  };
}

// Farm_Layers row (unified farm upload box, migration 089) — reprojected to
// EPSG:4326 at upload, so always crsStatus "ok". The GeoJSON itself is fetched
// lazily by VectorLayer rather than passed through page props.
export function farmLayerToMapRaster(l: { id: number; farm_id: number; name: string }): MapRaster {
  return {
    id: l.id,
    source: "layer",
    url: `/api/farms/${l.farm_id}/layers/${l.id}`,
    label: l.name,
    kind: "vector",
    crsStatus: "ok",
  };
}
