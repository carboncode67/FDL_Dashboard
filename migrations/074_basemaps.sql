-- Planned Changes items 6 + 7: large raster upload + tiling, raster display on
-- Farm maps and in the Create-maps (sampling map) editor. Scoped in
-- docs/raster-tiling-plan.md.
--
-- "Basemaps" holds a lab member's directly-uploaded large raster (typically a
-- drone orthomosaic GeoTIFF, 1-5 GB, in a UTM/local CRS) plus the state of its
-- tiling job on PipelineProcessor. Same shape as Context_Rasters/
-- Pipeline_Output_Rasters (filename/bytes/sha256, crs_status/crs_epsg
-- normalized by the same geo_sanity.py convention as pipeline outputs), plus
-- footprint (that pair lacks) and tiling_status/tile_dir/min_zoom/max_zoom for
-- the static tile pyramid PipelineProcessor generates. No lab_id here,
-- deliberately: like its two siblings above, it's a derived per-farm artifact
-- table, not one of the "owned/root" tables migration 067 backfilled directly
-- — lab scope is inherited via farm_id -> Farms.lab_id.
--
-- Additive-only, safe to re-run.

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Basemaps" (
  id                      SERIAL PRIMARY KEY,
  farm_id                 INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Farms"(id) ON DELETE CASCADE,
  drone_flight_record_id  INT REFERENCES "pgntarg2udzj1f3"."Drone_Flight_Records"(id) ON DELETE SET NULL,
  uploaded_by_id          TEXT REFERENCES "public"."users"(id) ON DELETE SET NULL,
  original_filename       TEXT NOT NULL,                    -- name as uploaded
  source_filename         TEXT NOT NULL,                    -- flat basename under DATA_DIR/basemap-sources/
  bytes                   BIGINT NOT NULL,
  sha256                  TEXT NOT NULL,
  -- Set by PipelineProcessor's tiling job reusing geo_sanity.py's candidate-CRS
  -- check (same convention as Pipeline_Output_Rasters -- see migration 059).
  -- "unclear" = do not plot; NULL = tiling hasn't finished yet.
  crs_status              TEXT,
  crs_epsg                INT,
  footprint               JSONB,                             -- GeoJSON Polygon, filled in once tiling reads the file
  tiling_status           TEXT NOT NULL DEFAULT 'pending',   -- pending | tiling | ready | failed
  tile_dir                TEXT,                              -- e.g. "<id>" under DATA_DIR/basemap-tiles/
  min_zoom                INT,
  max_zoom                INT,
  error_message           TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_basemaps_farm ON "pgntarg2udzj1f3"."Basemaps"(farm_id);
CREATE INDEX IF NOT EXISTS idx_basemaps_tiling_status ON "pgntarg2udzj1f3"."Basemaps"(tiling_status);

-- Item 6.2: per-sampling-map raster-basemap toolbar setting, same "one setting
-- per map, set from the editor toolbar" precedent as form_id/proximity_radius_m
-- (see migration 073). basemap_buffer_m is POSITIVE (extend beyond the field
-- boundary) -- the opposite sign convention from the point-generation
-- toolset's inward edge buffer, since these serve opposite purposes.
ALTER TABLE "pgntarg2udzj1f3"."Sampling_Maps"
  ADD COLUMN IF NOT EXISTS basemap_id INT REFERENCES "pgntarg2udzj1f3"."Basemaps"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS basemap_buffer_m DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS basemap_max_zoom INT;

CREATE INDEX IF NOT EXISTS idx_sampling_maps_basemap ON "pgntarg2udzj1f3"."Sampling_Maps"(basemap_id);
