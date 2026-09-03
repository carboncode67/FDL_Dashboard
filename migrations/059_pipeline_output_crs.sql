-- Pipeline outputs are now CRS-verified/normalized to EPSG:4326 on the
-- processing machine before this table ever sees them (see
-- PipelineProcessor/geo_sanity.py) by reprojecting the file's centroid against
-- the triggering run's resolved farm centroid. These columns record the
-- outcome so the map component knows whether a given output is actually safe
-- to render, and this table now also covers vector (.geojson/.gpkg) outputs,
-- not just rasters — "Rasters" in the table name predates that, kept as-is to
-- avoid an unnecessary rename.
ALTER TABLE "pgntarg2udzj1f3"."Pipeline_Output_Rasters"
  ADD COLUMN IF NOT EXISTS kind       TEXT NOT NULL DEFAULT 'raster', -- 'raster' | 'vector'
  ADD COLUMN IF NOT EXISTS crs_status TEXT,                           -- 'ok' | 'unclear' | NULL (no farm to check against)
  ADD COLUMN IF NOT EXISTS crs_epsg   INT;                            -- the EPSG geo_sanity matched and normalized to, when crs_status = 'ok'
