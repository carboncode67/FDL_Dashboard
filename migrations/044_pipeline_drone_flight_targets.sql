-- Adds support for manually-run, per-drone-flight "organize imagery" pipelines
-- (item 90 Phase 2 — see ../../Item90_Processing_Pipeline_Scope.md). Unlike every
-- other pipeline, these aren't triggered by an upload — raw drone imagery is copied
-- directly onto the processing machine (never through the Dashboard's upload
-- storage), so there's no upload row to match against. They're always run manually
-- against a chosen Drone_Flight_Records row instead.

ALTER TABLE "pgntarg2udzj1f3"."Pipelines"
  ALTER COLUMN match_table DROP NOT NULL;

ALTER TABLE "pgntarg2udzj1f3"."Pipelines"
  ADD COLUMN IF NOT EXISTS target_kind TEXT; -- null = upload-matched (default) | 'drone_flight' = manual per-flight

ALTER TABLE "pgntarg2udzj1f3"."Pipeline_Runs"
  ADD COLUMN IF NOT EXISTS target_drone_flight_id INT
    REFERENCES "pgntarg2udzj1f3"."Drone_Flight_Records"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS output_storage_path TEXT; -- where the processing machine wrote final output on zraid1

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_target_drone_flight
  ON "pgntarg2udzj1f3"."Pipeline_Runs"(target_drone_flight_id);
