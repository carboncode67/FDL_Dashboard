-- Spatial context Update / Expand (docs/context-update-and-farm-timeline-plan.md §1).
-- A job now records why it was made: a fresh pull, an Update (from the end of
-- what the farm already has up to today) or an Expand (the gap(s) a widened
-- date range adds). One Update/Expand request can create several jobs (one per
-- distinct date range); parent_job_id ties the rest to the first.
--
-- Safe to re-run.

ALTER TABLE "pgntarg2udzj1f3"."Context_Fetch_Jobs"
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'pull';

ALTER TABLE "pgntarg2udzj1f3"."Context_Fetch_Jobs"
  ADD COLUMN IF NOT EXISTS parent_job_id INT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_context_fetch_jobs_parent') THEN
    ALTER TABLE "pgntarg2udzj1f3"."Context_Fetch_Jobs" ADD CONSTRAINT fk_context_fetch_jobs_parent
      FOREIGN KEY (parent_job_id) REFERENCES "pgntarg2udzj1f3"."Context_Fetch_Jobs"(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_context_fetch_jobs_mode') THEN
    ALTER TABLE "pgntarg2udzj1f3"."Context_Fetch_Jobs" ADD CONSTRAINT ck_context_fetch_jobs_mode
      CHECK (mode IN ('pull', 'update', 'expand'));
  END IF;
END $$;
