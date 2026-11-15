-- Agents: the space-time observation map (docs/agent-sandbox-plan.md §6a).
--
-- Pass 1 ("observe") turns each upload into one row here: WHEN and WHERE come
-- from the source record itself (capture timestamp, GPS, field, farm — filled
-- server-side by lib/agent/observations.ts, not by the model), WHAT is the
-- model's short structured description. Pass 2 ("synthesize") reads these rows
-- per farm and season instead of raw upload content, so injected instructions
-- in a photo or note never reach the pass that makes recommendations.
--
-- One CURRENT observation per source record (partial unique index). Re-observing
-- with a newer model/prompt marks the previous row 'superseded' in the same
-- transaction, so history is kept and readers just filter status = 'current'.
--
-- Root-table conventions as 092: lab_id NOT NULL with the GUC default, FK to
-- labs, ENABLE (not FORCE) RLS tenant_isolation; the /api/agent/* routes also
-- filter by the token's lab explicitly.
--
-- Additive only, safe to re-run.

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Agent_Observations" (
  id                  SERIAL PRIMARY KEY,
  lab_id              INT NOT NULL DEFAULT current_setting('app.current_lab_id', true)::int
                      CONSTRAINT fk_agent_observations_lab_id REFERENCES public.labs(id),
  run_id              INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Agent_Runs"(id) ON DELETE CASCADE,

  -- what was observed (validated against the agent read registry, not an enum)
  source_table        TEXT NOT NULL,
  source_id           INT NOT NULL,

  -- WHERE (server-derived)
  farm_id             INT REFERENCES "pgntarg2udzj1f3"."Farms"(id) ON DELETE CASCADE,
  field_id            INT REFERENCES "pgntarg2udzj1f3"."Fields"(id) ON DELETE SET NULL,
  latitude            DOUBLE PRECISION,
  longitude           DOUBLE PRECISION,
  location_source     TEXT NOT NULL CHECK (location_source IN ('gps', 'field', 'farm', 'content', 'unknown')),

  -- WHEN (server-derived; 'content' = a date the model read from the item, range-checked)
  observed_at         TIMESTAMPTZ,
  time_source         TEXT NOT NULL CHECK (time_source IN ('capture', 'upload', 'content', 'unknown')),

  -- WHAT (model output, plain text, length-capped)
  subjects            TEXT[] NOT NULL DEFAULT '{}',    -- from a fixed vocabulary (lib/agent/observations.ts)
  crop                TEXT,
  growth_stage        TEXT,
  description         TEXT NOT NULL,
  extracted_text      TEXT,                            -- text visible/quoted in the item, kept as data
  suspected_injection BOOLEAN NOT NULL DEFAULT false,  -- the item seemed to address instructions to an AI
  confidence          REAL,

  model               TEXT,
  prompt_sha256       CHAR(64),
  status              TEXT NOT NULL DEFAULT 'current' CHECK (status IN ('current', 'superseded', 'dismissed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_observations_current_source
  ON "pgntarg2udzj1f3"."Agent_Observations"(lab_id, source_table, source_id) WHERE status = 'current';
CREATE INDEX IF NOT EXISTS idx_agent_observations_farm_time
  ON "pgntarg2udzj1f3"."Agent_Observations"(lab_id, farm_id, observed_at) WHERE status = 'current';
CREATE INDEX IF NOT EXISTS idx_agent_observations_run
  ON "pgntarg2udzj1f3"."Agent_Observations"(run_id);

ALTER TABLE "pgntarg2udzj1f3"."Agent_Observations" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Agent_Observations' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Agent_Observations"
      USING (lab_id = current_setting('app.current_lab_id', true)::int)
      WITH CHECK (lab_id = current_setting('app.current_lab_id', true)::int);
  END IF;
END $$;
