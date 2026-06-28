-- Add Vikunja external IDs for bidirectional task sync
ALTER TABLE "pgntarg2udzj1f3"."Farm_Experiments"
  ADD COLUMN IF NOT EXISTS vikunja_project_id INTEGER;

ALTER TABLE "pgntarg2udzj1f3"."Tasks"
  ADD COLUMN IF NOT EXISTS vikunja_task_id INTEGER;
