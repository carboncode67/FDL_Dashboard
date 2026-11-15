-- Kriged yield maps for yield-card runs (090). After cleaning, PipelineProcessor
-- kriges each field's kept yield (yieldclean's `interpolate` mode) and sends
-- back a coloured, tiled map, which lib/yield-runs.ts keeps as a Basemap
-- (basemap_id; a re-run replaces its own). `interpolation` holds what the
-- processor reported: unit, legend (quintile colours + bounds, same as the
-- points layer), per-field kriging summary (method ordinary|regression, CV
-- RMSEs), number of context rasters used, or {error} when kriging failed.
--
-- context_job_id: the Context_Fetch_Jobs row a run asked for when the farm
-- had no Sentinel-2 dates for the season. When that job finishes with
-- rasters, the run is re-sent once to pick up regression kriging.
--
-- Safe to re-run.

ALTER TABLE "pgntarg2udzj1f3"."Yield_Runs"
  ADD COLUMN IF NOT EXISTS basemap_id INT REFERENCES "pgntarg2udzj1f3"."Basemaps"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS interpolation JSONB,
  ADD COLUMN IF NOT EXISTS context_job_id INT REFERENCES "pgntarg2udzj1f3"."Context_Fetch_Jobs"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_yield_runs_context_job ON "pgntarg2udzj1f3"."Yield_Runs"(context_job_id);
