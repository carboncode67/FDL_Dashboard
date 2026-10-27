-- NAIP basemap-from-bounding-box, commit step: the MBTiles package PipelineProcessor
-- builds for a map's naip_bbox (migration 084) and the Dashboard keeps on disk
-- (DATA_DIR/naip-packages/<sampling_map_id>.mbtiles) for the phone apps to download.
--
-- naip_package_status describes the LATEST build attempt (pending | ready | failed).
-- The remaining naip_package_* columns describe the file currently on disk and are
-- only overwritten when a build succeeds, so a failed rebuild keeps serving the old
-- package (non-null naip_package_sha256 == "a package exists").
ALTER TABLE "pgntarg2udzj1f3"."Sampling_Maps"
  ADD COLUMN IF NOT EXISTS naip_package_status       TEXT,
  ADD COLUMN IF NOT EXISTS naip_package_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS naip_package_error        TEXT,
  ADD COLUMN IF NOT EXISTS naip_package_built_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS naip_package_bbox         JSONB,
  ADD COLUMN IF NOT EXISTS naip_package_min_zoom     INT,
  ADD COLUMN IF NOT EXISTS naip_package_max_zoom     INT,
  ADD COLUMN IF NOT EXISTS naip_package_tiles        INT,
  ADD COLUMN IF NOT EXISTS naip_package_bytes        INT,
  ADD COLUMN IF NOT EXISTS naip_package_sha256       TEXT;
