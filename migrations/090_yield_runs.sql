-- Yield-card cleaning from the unified farm upload box: a zipped CNH CN1 card
-- (*.cn1 folder) is stored under DATA_DIR/yield-sources/ and sent to
-- PipelineProcessor's yieldclean job (USDA Yield Editor AYCE port). One row
-- per upload; status pending (not yet accepted by the processor) | processing
-- | ready | failed. On success the kept points become a Farm_Layers overlay
-- (layer_id) and the full results archive a farm Document
-- (results_document_id); the original zip is a Document too
-- (source_document_id).
--
-- Farm_id child table: 075's subquery RLS policy against Farms, same as 089.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Yield_Runs" (
  id                  SERIAL PRIMARY KEY,
  farm_id             INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Farms"(id) ON DELETE CASCADE,
  original_filename   TEXT NOT NULL,
  source_filename     TEXT NOT NULL,
  bytes               BIGINT NOT NULL,
  sha256              TEXT NOT NULL,
  display_name        TEXT,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  error_message       TEXT,
  preset              TEXT,
  yield_unit          TEXT,
  kept_points         INT,
  summary             JSONB,
  layer_id            INT REFERENCES "pgntarg2udzj1f3"."Farm_Layers"(id) ON DELETE SET NULL,
  source_document_id  INT REFERENCES "pgntarg2udzj1f3"."Documents"(id) ON DELETE SET NULL,
  results_document_id INT REFERENCES "pgntarg2udzj1f3"."Documents"(id) ON DELETE SET NULL,
  uploaded_by_id      TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_yield_runs_farm ON "pgntarg2udzj1f3"."Yield_Runs"(farm_id);

DO $$
BEGIN
  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Yield_Runs" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Yield_Runs' AND policyname = 'tenant_isolation'
  ) THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Yield_Runs" USING ("farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms")) WITH CHECK ("farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms"))$sql$;
  END IF;
END $$;

-- Existing app_<slug> roles pick this table up via ALTER DEFAULT PRIVILEGES in
-- create_lab_role.sql.template as long as this file is run as nocodb.
