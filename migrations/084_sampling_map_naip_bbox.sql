-- NAIP basemap-from-bounding-box: the box a lab member draws in the sampling-map
-- editor, as [west, south, east, north] in WGS84 degrees (same order as
-- lib/geo.ts's Bounds). Nullable; one box per map, like basemap_buffer_m /
-- basemap_max_zoom (migration 074). Imagery is rendered on demand from
-- PipelineProcessor's GET /naip/tiles/..., nothing is stored by this column.
ALTER TABLE "pgntarg2udzj1f3"."Sampling_Maps"
  ADD COLUMN IF NOT EXISTS naip_bbox JSONB;
