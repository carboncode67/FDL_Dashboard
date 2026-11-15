-- Data Sleuth agent, phase 1 — see docs/agent-sandbox-plan.md §3–§4.
--
-- 1. Agent_Tokens: a principal that is NOT a public.users row. It can't hold an
--    RBAC role, can't be marked is_service_account, and can't log in. Only the
--    sha256 of the token is stored. lib/upload-auth.ts never looks here, so an
--    agent token can't authenticate to /api/data/* or /api/upload/* at all —
--    only lib/agent/auth.ts (the /api/agent/* routes) accepts it.
-- 2. Agent_Runs: one row per sleuth run. Every agent write carries a run_id,
--    so a bad run can be reverted by deleting its open rows.
-- 3. The agent's output tables. The agent writes ONLY here — never to core
--    data. Anything that would change research data is an Agent_Recommendations
--    row a human approves (suggest → approve).
--
-- Tables live in the experiment schema (Agent_ prefix) rather than a separate
-- schema, so the app_<slug> roles' ALTER DEFAULT PRIVILEGES in
-- sql/roles/create_lab_role.sql.template already cover them. Root-table
-- conventions follow 087: lab_id NOT NULL, DEFAULT = app.current_lab_id GUC,
-- FK to labs, ENABLE (not FORCE) RLS tenant_isolation. The /api/agent/* routes
-- also filter by the token's lab_id explicitly, because RLS isn't a boundary
-- while TENANT_ENFORCEMENT=off.
--
-- target_table / source_table values are validated by the app against the
-- agent read registry (lib/agent/registry.ts), not by a DB enum, so adding a
-- readable table needs no migration.
--
-- Additive only, safe to re-run: IF NOT EXISTS throughout, policy creation guarded.

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Agent_Tokens" (
  id            SERIAL PRIMARY KEY,
  lab_id        INT NOT NULL DEFAULT current_setting('app.current_lab_id', true)::int
                CONSTRAINT fk_agent_tokens_lab_id REFERENCES public.labs(id),
  name          TEXT NOT NULL,
  token_hash    CHAR(64) NOT NULL UNIQUE,
  token_prefix  TEXT NOT NULL,                       -- first chars of the token, for display only
  scopes        TEXT[] NOT NULL DEFAULT ARRAY['read', 'write'],
  created_by_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  last_used_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Agent_Runs" (
  id            SERIAL PRIMARY KEY,
  lab_id        INT NOT NULL DEFAULT current_setting('app.current_lab_id', true)::int
                CONSTRAINT fk_agent_runs_lab_id REFERENCES public.labs(id),
  token_id      INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Agent_Tokens"(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'aborted', 'reverted')),
  task          TEXT,                                -- e.g. "sort status-2 uploads since last run"
  model         TEXT,
  vision_model  TEXT,
  prompt_sha256 CHAR(64),
  write_budget  INT NOT NULL DEFAULT 200,
  write_count   INT NOT NULL DEFAULT 0,
  summary       TEXT,
  tool_log      JSONB,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_lab_started ON "pgntarg2udzj1f3"."Agent_Runs"(lab_id, started_at DESC);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Agent_Tag_Vocabulary" (
  id          SERIAL PRIMARY KEY,
  lab_id      INT NOT NULL DEFAULT current_setting('app.current_lab_id', true)::int
              CONSTRAINT fk_agent_tag_vocabulary_lab_id REFERENCES public.labs(id),
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_tag_vocabulary_lab_name
  ON "pgntarg2udzj1f3"."Agent_Tag_Vocabulary"(lab_id, lower(name));

-- Shared review columns on every output table: status + who decided + when + why.
CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Agent_Comments" (
  id            SERIAL PRIMARY KEY,
  lab_id        INT NOT NULL DEFAULT current_setting('app.current_lab_id', true)::int
                CONSTRAINT fk_agent_comments_lab_id REFERENCES public.labs(id),
  run_id        INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Agent_Runs"(id) ON DELETE CASCADE,
  target_table  TEXT NOT NULL,
  target_id     INT NOT NULL,
  body          TEXT NOT NULL,
  confidence    REAL,
  evidence      JSONB NOT NULL DEFAULT '[]'::jsonb,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'dismissed', 'superseded')),
  decided_by_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at    TIMESTAMPTZ,
  decision_note TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_comments_target ON "pgntarg2udzj1f3"."Agent_Comments"(target_table, target_id);
CREATE INDEX IF NOT EXISTS idx_agent_comments_run ON "pgntarg2udzj1f3"."Agent_Comments"(run_id);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Agent_Tag_Links" (
  id            SERIAL PRIMARY KEY,
  lab_id        INT NOT NULL DEFAULT current_setting('app.current_lab_id', true)::int
                CONSTRAINT fk_agent_tag_links_lab_id REFERENCES public.labs(id),
  run_id        INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Agent_Runs"(id) ON DELETE CASCADE,
  target_table  TEXT NOT NULL,
  target_id     INT NOT NULL,
  tag_id        INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Agent_Tag_Vocabulary"(id) ON DELETE CASCADE,
  confidence    REAL,
  evidence      JSONB NOT NULL DEFAULT '[]'::jsonb,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'dismissed', 'superseded')),
  decided_by_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at    TIMESTAMPTZ,
  decision_note TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_tag_links_target ON "pgntarg2udzj1f3"."Agent_Tag_Links"(target_table, target_id);
CREATE INDEX IF NOT EXISTS idx_agent_tag_links_run ON "pgntarg2udzj1f3"."Agent_Tag_Links"(run_id);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Agent_Links" (
  id            SERIAL PRIMARY KEY,
  lab_id        INT NOT NULL DEFAULT current_setting('app.current_lab_id', true)::int
                CONSTRAINT fk_agent_links_lab_id REFERENCES public.labs(id),
  run_id        INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Agent_Runs"(id) ON DELETE CASCADE,
  source_table  TEXT NOT NULL,
  source_id     INT NOT NULL,
  target_table  TEXT NOT NULL,
  target_id     INT NOT NULL,
  relation      TEXT NOT NULL CHECK (relation IN (
                  'calibration_reference', 'same_event', 'supports', 'contradicts', 'input_to', 'duplicate_of')),
  rationale     TEXT NOT NULL,
  confidence    REAL,
  evidence      JSONB NOT NULL DEFAULT '[]'::jsonb,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'dismissed', 'superseded')),
  decided_by_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at    TIMESTAMPTZ,
  decision_note TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_links_source ON "pgntarg2udzj1f3"."Agent_Links"(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_agent_links_target ON "pgntarg2udzj1f3"."Agent_Links"(target_table, target_id);
CREATE INDEX IF NOT EXISTS idx_agent_links_run ON "pgntarg2udzj1f3"."Agent_Links"(run_id);

-- Suggest → approve. `proposed` is the change; `current_snapshot` the target's
-- values at proposal time (an approver applying it after the record changed
-- sees it marked superseded); `computation` the compute-tool call(s) behind any
-- number, so a reviewer can re-run it.
CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Agent_Recommendations" (
  id               SERIAL PRIMARY KEY,
  lab_id           INT NOT NULL DEFAULT current_setting('app.current_lab_id', true)::int
                   CONSTRAINT fk_agent_recommendations_lab_id REFERENCES public.labs(id),
  run_id           INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Agent_Runs"(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('upload_sort', 'data_correction', 'analysis_parameter', 'tag_new')),
  target_table     TEXT,
  target_id        INT,
  proposed         JSONB NOT NULL,
  current_snapshot JSONB,
  computation      JSONB,
  rationale        TEXT NOT NULL,
  confidence       REAL,
  evidence         JSONB NOT NULL DEFAULT '[]'::jsonb,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'rejected', 'dismissed', 'superseded')),
  decided_by_id    TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at       TIMESTAMPTZ,
  decision_note    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_recommendations_target ON "pgntarg2udzj1f3"."Agent_Recommendations"(target_table, target_id);
CREATE INDEX IF NOT EXISTS idx_agent_recommendations_open ON "pgntarg2udzj1f3"."Agent_Recommendations"(lab_id, kind) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_agent_recommendations_run ON "pgntarg2udzj1f3"."Agent_Recommendations"(run_id);

-- Prose requirements for an analysis the agent wants but has no tool for.
-- Never code. A human takes a spec forward (export to another LLM / a
-- developer, or "create pipeline from spec") and records the result.
CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Agent_Analysis_Specs" (
  id                      SERIAL PRIMARY KEY,
  lab_id                  INT NOT NULL DEFAULT current_setting('app.current_lab_id', true)::int
                          CONSTRAINT fk_agent_analysis_specs_lab_id REFERENCES public.labs(id),
  run_id                  INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Agent_Runs"(id) ON DELETE CASCADE,
  title                   TEXT NOT NULL,
  problem                 TEXT NOT NULL,
  inputs                  JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{table, id, role}]
  method                  TEXT NOT NULL,
  expected_outputs        TEXT NOT NULL,
  validation              TEXT,
  open_questions          TEXT,
  status                  TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'in_progress', 'implemented', 'dismissed')),
  implemented_pipeline_id INT REFERENCES "pgntarg2udzj1f3"."Pipelines"(id) ON DELETE SET NULL,
  decided_by_id           TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at              TIMESTAMPTZ,
  decision_note           TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_analysis_specs_run ON "pgntarg2udzj1f3"."Agent_Analysis_Specs"(run_id);

-- RLS — same ENABLE (not FORCE) convention as 070/087.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Agent_Tokens', 'Agent_Runs', 'Agent_Tag_Vocabulary', 'Agent_Comments',
    'Agent_Tag_Links', 'Agent_Links', 'Agent_Recommendations', 'Agent_Analysis_Specs'
  ]
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
