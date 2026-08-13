-- Pipelines.created_by was the only FK to public.users(id) in the whole schema
-- without an ON DELETE action (defaults to NO ACTION/RESTRICT) and was NOT NULL,
-- so deleting a user who had ever created a Pipeline threw an uncaught FK
-- violation (P2003) that the API silently 500'd on. Match the SetNull pattern
-- already used for Farm_Experiments.created_by_id and Forms.created_by_id.
ALTER TABLE "pgntarg2udzj1f3"."Pipelines"
  ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE "pgntarg2udzj1f3"."Pipelines"
  DROP CONSTRAINT IF EXISTS "Pipelines_created_by_fkey";

ALTER TABLE "pgntarg2udzj1f3"."Pipelines"
  ADD CONSTRAINT "Pipelines_created_by_fkey"
  FOREIGN KEY (created_by) REFERENCES "public"."users"(id) ON DELETE SET NULL;
