-- Automatic triggers for declarative pipelines (docs/pipeline-requests-plan.md, phase 3).
--
-- Pipeline_Triggers: "run pipeline <key> when an upload matching these rules
-- arrives in this lab". The upload becomes the pipeline's trigger_input; its
-- other inputs must be automatic (farm fields, context rasters), checked when
-- the rule is saved. Same wildcard rules as the legacy Pipelines.match_*: a
-- NULL match_* matches anything. params override the pipeline's defaults.
-- Only admins edit triggers; a trigger only fires while the pipeline is
-- `live` in the processor's catalogue.
--
-- Pipeline_Runs_V2 gains trigger_table / trigger_id / trigger_rule_id: which
-- upload (and rule) started a run. A pipeline version runs at most once per
-- upload unless the earlier run failed (lib/pipeline-triggers.ts).
--
-- Root-table conventions as 102/105/106. Safe to re-run.

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Pipeline_Triggers" (
  id                   SERIAL PRIMARY KEY,
  lab_id               INT NOT NULL DEFAULT current_setting('app.current_lab_id', true)::int
                       CONSTRAINT fk_pipeline_triggers_lab_id REFERENCES public.labs(id),
  pipeline_key         TEXT NOT NULL,
  trigger_input        TEXT NOT NULL,
  match_table          TEXT NOT NULL,
  match_category       TEXT,
  match_project_id     INT REFERENCES "pgntarg2udzj1f3"."Projects"(id) ON DELETE CASCADE,
  match_data_table_id  INT REFERENCES "pgntarg2udzj1f3"."Tables"(id) ON DELETE CASCADE,
  params               JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled              BOOLEAN NOT NULL DEFAULT true,
  created_by_id        TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pipeline_triggers_match
  ON "pgntarg2udzj1f3"."Pipeline_Triggers"(lab_id, match_table) WHERE enabled;

ALTER TABLE "pgntarg2udzj1f3"."Pipeline_Runs_V2"
  ADD COLUMN IF NOT EXISTS trigger_table   TEXT,
  ADD COLUMN IF NOT EXISTS trigger_id      INT,
  ADD COLUMN IF NOT EXISTS trigger_rule_id INT REFERENCES "pgntarg2udzj1f3"."Pipeline_Triggers"(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_v2_trigger
  ON "pgntarg2udzj1f3"."Pipeline_Runs_V2"(trigger_table, trigger_id);

ALTER TABLE "pgntarg2udzj1f3"."Pipeline_Triggers" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Pipeline_Triggers' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Pipeline_Triggers"
      USING (lab_id = current_setting('app.current_lab_id', true)::int)
      WITH CHECK (lab_id = current_setting('app.current_lab_id', true)::int);
  END IF;
END $$;
