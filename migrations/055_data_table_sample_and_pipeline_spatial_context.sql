-- Data Table sample file: an example CSV stored alongside the column schema +
-- description, so a data-processing pipeline (and the LLM that wires its
-- script) can see real column names and a few rows, not just labels.
ALTER TABLE "pgntarg2udzj1f3"."Tables"
  ADD COLUMN IF NOT EXISTS sample_filename       TEXT,
  ADD COLUMN IF NOT EXISTS sample_original_name  TEXT;

-- Pipeline flag: when set, the processing machine is told per-farm spatial
-- context rasters (terrain / soil / imagery COGs) are available and may be
-- used for spatially-informed interpolation (kriging, regression kriging, ML).
ALTER TABLE "pgntarg2udzj1f3"."Pipelines"
  ADD COLUMN IF NOT EXISTS use_spatial_context BOOLEAN NOT NULL DEFAULT false;
