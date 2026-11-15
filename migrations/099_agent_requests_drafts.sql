-- Agents: interactive requests and geometry drafts (docs/cartographer-agent-plan.md §5.1a–§5.3).
--
-- Agent_Requests: a person asks an interactive agent (Cartographer) to do
--   something on ONE sampling map. A worker claims it; the claim binds the run
--   to that map (Agent_Runs.scope_map_id), and every read/compute/draft of that
--   run is confined to the map and its farm server-side.
-- Agent_Geometry_Drafts: what the agent proposes (points/polygons as GeoJSON +
--   how they were computed). Inert until the requester applies it through a
--   normal permission-checked route. Applying only INSERTS; applied rows carry
--   agent_draft_id so "undo this draft" removes exactly those rows.
--
-- Root-table conventions as 092/097: lab_id NOT NULL with the GUC default, FK to
-- labs, ENABLE (not FORCE) RLS tenant_isolation. Additive only, safe to re-run.

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Agent_Requests" (
  id                  SERIAL PRIMARY KEY,
  lab_id              INT NOT NULL DEFAULT current_setting('app.current_lab_id', true)::int
                      CONSTRAINT fk_agent_requests_lab_id REFERENCES public.labs(id),
  agent_kind          TEXT NOT NULL,
  requested_by_id     TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  channel             TEXT NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'app')),
  sampling_map_id     INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Sampling_Maps"(id) ON DELETE CASCADE,
  prompt              TEXT NOT NULL,
  context             JSONB NOT NULL DEFAULT '{}'::jsonb,   -- e.g. {"point_id": 881}
  status              TEXT NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued', 'claimed', 'done', 'failed', 'cancelled', 'expired')),
  run_id              INT REFERENCES "pgntarg2udzj1f3"."Agent_Runs"(id) ON DELETE SET NULL,
  claimed_at          TIMESTAMPTZ,
  answer              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_requests_queue ON "pgntarg2udzj1f3"."Agent_Requests"(agent_kind, status, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_requests_map ON "pgntarg2udzj1f3"."Agent_Requests"(sampling_map_id, created_at DESC);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Agent_Geometry_Drafts" (
  id                  SERIAL PRIMARY KEY,
  lab_id              INT NOT NULL DEFAULT current_setting('app.current_lab_id', true)::int
                      CONSTRAINT fk_agent_geometry_drafts_lab_id REFERENCES public.labs(id),
  request_id          INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Agent_Requests"(id) ON DELETE CASCADE,
  run_id              INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Agent_Runs"(id) ON DELETE CASCADE,
  sampling_map_id     INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Sampling_Maps"(id) ON DELETE CASCADE,
  features            JSONB NOT NULL,          -- GeoJSON FeatureCollection (Points / Polygons)
  explanation         TEXT,
  provenance          JSONB NOT NULL DEFAULT '[]'::jsonb,   -- tool calls + parameters (incl. seeds)
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'applied', 'discarded', 'undone')),
  applied_by_id       TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  applied_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_geometry_drafts_request ON "pgntarg2udzj1f3"."Agent_Geometry_Drafts"(request_id);
CREATE INDEX IF NOT EXISTS idx_agent_geometry_drafts_map ON "pgntarg2udzj1f3"."Agent_Geometry_Drafts"(sampling_map_id, status);

-- A run's binding to one map (set when the run claims a request).
ALTER TABLE "pgntarg2udzj1f3"."Agent_Runs" ADD COLUMN IF NOT EXISTS scope_map_id INT
  REFERENCES "pgntarg2udzj1f3"."Sampling_Maps"(id) ON DELETE SET NULL;
ALTER TABLE "pgntarg2udzj1f3"."Agent_Runs" ADD COLUMN IF NOT EXISTS request_id INT
  REFERENCES "pgntarg2udzj1f3"."Agent_Requests"(id) ON DELETE SET NULL;

-- Rows created by applying a draft (drives "undo this draft").
ALTER TABLE "pgntarg2udzj1f3"."Sampling_Points" ADD COLUMN IF NOT EXISTS agent_draft_id INT
  REFERENCES "pgntarg2udzj1f3"."Agent_Geometry_Drafts"(id) ON DELETE SET NULL;
ALTER TABLE "pgntarg2udzj1f3"."Sampling_Map_Polygons" ADD COLUMN IF NOT EXISTS agent_draft_id INT
  REFERENCES "pgntarg2udzj1f3"."Agent_Geometry_Drafts"(id) ON DELETE SET NULL;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['Agent_Requests', 'Agent_Geometry_Drafts']
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
