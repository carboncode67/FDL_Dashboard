-- Runs of declarative pipelines (docs/pipeline-requests-plan.md, phase 2).
--
-- A pipeline here is a reviewed definition on PipelineProcessor
-- (pipelines/<key>/pipeline.yaml, served by GET /v2/catalog), not a row the
-- Dashboard owns, so a run records the key and version it ran. The legacy
-- script pipelines keep Pipelines / Pipeline_Runs until they are retired.
--
-- inputs:  what was chosen per pipeline input ({name: {kind, document_id |
--          basemap_id | auto}}), as sent (minus URLs).
-- params:  the settings sent.
-- steps:   the processor's per-step report (status, seconds, notes, error).
-- outputs: what was kept, per pipeline output ({name, kind, farm_layer_id |
--          basemap_id | document_id, error?}).
-- status:  pending (not accepted yet) | running | ready | partial (an
--          optional step failed; the rest landed) | failed.
-- request_id: the Pipeline_Requests row with this pipeline_key, if any.
--
-- Root-table conventions as 102/105. Safe to re-run.

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Pipeline_Runs_V2" (
  id                SERIAL PRIMARY KEY,
  lab_id            INT NOT NULL DEFAULT current_setting('app.current_lab_id', true)::int
                    CONSTRAINT fk_pipeline_runs_v2_lab_id REFERENCES public.labs(id),
  pipeline_key      TEXT NOT NULL,
  pipeline_version  INT,
  pipeline_name     TEXT NOT NULL,
  farm_id           INT REFERENCES "pgntarg2udzj1f3"."Farms"(id) ON DELETE CASCADE,
  request_id        INT REFERENCES "pgntarg2udzj1f3"."Pipeline_Requests"(id) ON DELETE SET NULL,
  inputs            JSONB NOT NULL DEFAULT '{}'::jsonb,
  params            JSONB NOT NULL DEFAULT '{}'::jsonb,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'ready', 'partial', 'failed')),
  steps             JSONB,
  outputs           JSONB,
  error_message     TEXT,
  created_by_id     TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  started_at        TIMESTAMPTZ,
  finished_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_v2_farm ON "pgntarg2udzj1f3"."Pipeline_Runs_V2"(farm_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_v2_key ON "pgntarg2udzj1f3"."Pipeline_Runs_V2"(lab_id, pipeline_key);

ALTER TABLE "pgntarg2udzj1f3"."Pipeline_Runs_V2" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Pipeline_Runs_V2' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Pipeline_Runs_V2"
      USING (lab_id = current_setting('app.current_lab_id', true)::int)
      WITH CHECK (lab_id = current_setting('app.current_lab_id', true)::int);
  END IF;
END $$;
