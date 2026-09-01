-- 1. Snapshot which Farm a Pipeline_Run is associated with, resolved once at run
--    creation time (see lib/pipeline-farm.ts) from whichever of the six trigger
--    shapes applies (direct upload farm_id / test-data-rows via Experiment_Tests ->
--    Farm_Experiments / drone-flight via Drone_Flight_Records -> Experiment_Drone_Flights
--    -> Farm_Experiments) — never resolved live, since trigger_upload_id is a bare,
--    untyped polymorphic reference with no single join covering all six shapes. NULL
--    means no farm could be resolved (e.g. a manual "Run"/registration test-run with
--    no upload/experiment context) — the UI shows this as "No Farm Associated".
ALTER TABLE "pgntarg2udzj1f3"."Pipeline_Runs"
  ADD COLUMN IF NOT EXISTS farm_id INT REFERENCES "pgntarg2udzj1f3"."Farms"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_farm ON "pgntarg2udzj1f3"."Pipeline_Runs"(farm_id);

-- 2. Spatial (raster) pipeline outputs, pulled down from the processing machine and
--    linked to the farm the triggering run resolved to (see above) so they can be
--    shown on that farm's map — same shape/precedent as Context_Rasters, but farm_id
--    is only ever set when the run itself resolved to a farm (skipped otherwise; the
--    file is still referenced generically via Pipeline_Runs.output_files either way).
CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Pipeline_Output_Rasters" (
  id                SERIAL PRIMARY KEY,
  pipeline_run_id   INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Pipeline_Runs"(id) ON DELETE CASCADE,
  farm_id           INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Farms"(id) ON DELETE CASCADE,
  filename          TEXT NOT NULL, -- flat basename under DATA_DIR/pipeline-outputs/
  original_filename TEXT NOT NULL, -- the name the processing machine's output/ dir gave it
  bytes             BIGINT NOT NULL,
  sha256            TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_output_rasters_run ON "pgntarg2udzj1f3"."Pipeline_Output_Rasters"(pipeline_run_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_output_rasters_farm ON "pgntarg2udzj1f3"."Pipeline_Output_Rasters"(farm_id);
