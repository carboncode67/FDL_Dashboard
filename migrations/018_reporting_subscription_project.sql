-- Make activity report subscriptions project-based.
-- Adds project_id FK, drops the free-text label, and makes contact_ids nullable
-- (contacts are now derived from the project's farms at send time).

ALTER TABLE "pgntarg2udzj1f3"."Reporting_Subscriptions"
  ADD COLUMN IF NOT EXISTS project_id INTEGER
    REFERENCES "pgntarg2udzj1f3"."Projects"(id) ON DELETE SET NULL;

ALTER TABLE "pgntarg2udzj1f3"."Reporting_Subscriptions"
  DROP COLUMN IF EXISTS label;

ALTER TABLE "pgntarg2udzj1f3"."Reporting_Subscriptions"
  ALTER COLUMN contact_ids DROP NOT NULL;
