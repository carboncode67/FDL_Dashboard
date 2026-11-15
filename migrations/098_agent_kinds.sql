-- Agents: several agent kinds on one platform (docs/cartographer-agent-plan.md §5.1).
--
-- Agent_Tokens.agent_kind decides what a token's agent may do — which /api/agent/*
-- features, which tables it can read and which write kinds it can use
-- (lib/agent/kinds.ts). The kind comes from the token, never from the runner, so a
-- modified runner can't act as another kind. Existing tokens are Data Sleuth tokens.
-- Agent_Runs.agent_kind records the kind a run was opened with (history/audit).
--
-- Additive only, safe to re-run.

ALTER TABLE "pgntarg2udzj1f3"."Agent_Tokens" ADD COLUMN IF NOT EXISTS agent_kind TEXT NOT NULL DEFAULT 'sleuth';
ALTER TABLE "pgntarg2udzj1f3"."Agent_Runs"   ADD COLUMN IF NOT EXISTS agent_kind TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_tokens_agent_kind_check') THEN
    ALTER TABLE "pgntarg2udzj1f3"."Agent_Tokens"
      ADD CONSTRAINT agent_tokens_agent_kind_check CHECK (agent_kind IN ('sleuth', 'cartographer'));
  END IF;
END $$;

UPDATE "pgntarg2udzj1f3"."Agent_Runs" r
   SET agent_kind = t.agent_kind
  FROM "pgntarg2udzj1f3"."Agent_Tokens" t
 WHERE r.token_id = t.id AND r.agent_kind IS NULL;
