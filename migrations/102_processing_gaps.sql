-- "Unprocessable data" flags (GitHub issue #3, docs/unprocessable-data-flag-plan.md).
--
-- The agent only CLASSIFIES: pass 1 ("observe") now also says what kind of data
-- product an upload is (Agent_Observations.data_product, fixed vocabulary in
-- lib/agent/observations.ts; 'none' = not processable data, e.g. a crop photo).
--
-- The dashboard DECIDES: lib/processing-gaps.ts opens a Processing_Gaps row when a
-- sorted upload's current observation names a data product and no processing tool
-- covers it (no live pipeline matches, no pipeline run or yield run used it, no
-- Data Table template matched it). Rows are dashboard-owned, not agent output:
-- reverting an agent run doesn't delete them, and a dismissal survives
-- re-observation (one row per upload, never re-opened after dismissal).
--
-- status: open      → shown on Data Sorting + login banner
--         dismissed → a person said "one-off, no tool needed"
--         resolved  → a tool now covers it (pipeline went live / ran on it)
--
-- Processing_Gap_Ignores: "never flag <data_product> in this lab" — the per-type
-- dismiss. Open gaps of that type are dismissed when the ignore is added.
--
-- Root-table conventions as 092/097/101: lab_id NOT NULL with the GUC default, FK
-- to labs, ENABLE (not FORCE) RLS tenant_isolation. Additive only, safe to re-run.

ALTER TABLE "pgntarg2udzj1f3"."Agent_Observations" ADD COLUMN IF NOT EXISTS data_product TEXT;

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Processing_Gaps" (
  id                       SERIAL PRIMARY KEY,
  lab_id                   INT NOT NULL DEFAULT current_setting('app.current_lab_id', true)::int
                           CONSTRAINT fk_processing_gaps_lab_id REFERENCES public.labs(id),
  source_table             TEXT NOT NULL,          -- agent registry names: photos | notes | lab_member_uploads | documents
  source_id                INT NOT NULL,
  farm_id                  INT REFERENCES "pgntarg2udzj1f3"."Farms"(id) ON DELETE SET NULL,
  data_product             TEXT NOT NULL,
  observation_id           INT REFERENCES "pgntarg2udzj1f3"."Agent_Observations"(id) ON DELETE SET NULL,
  status                   TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'resolved')),
  decided_by_id            TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at               TIMESTAMPTZ,
  decision_note            TEXT,
  resolved_by_pipeline_id  INT REFERENCES "pgntarg2udzj1f3"."Pipelines"(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_processing_gaps_source
  ON "pgntarg2udzj1f3"."Processing_Gaps"(lab_id, source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_processing_gaps_open
  ON "pgntarg2udzj1f3"."Processing_Gaps"(lab_id, data_product) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Processing_Gap_Ignores" (
  id            SERIAL PRIMARY KEY,
  lab_id        INT NOT NULL DEFAULT current_setting('app.current_lab_id', true)::int
                CONSTRAINT fk_processing_gap_ignores_lab_id REFERENCES public.labs(id),
  data_product  TEXT NOT NULL,
  created_by_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_processing_gap_ignores
  ON "pgntarg2udzj1f3"."Processing_Gap_Ignores"(lab_id, data_product);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['Processing_Gaps', 'Processing_Gap_Ignores']
  LOOP
    EXECUTE format('ALTER TABLE "pgntarg2udzj1f3".%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = t AND policyname = 'tenant_isolation'
    ) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3".%I ' ||
        'USING (lab_id = current_setting(''app.current_lab_id'', true)::int) ' ||
        'WITH CHECK (lab_id = current_setting(''app.current_lab_id'', true)::int)',
        t
      );
    END IF;
  END LOOP;
END $$;
