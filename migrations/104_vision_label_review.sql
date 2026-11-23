-- Machine vision: checking imported labels before training (issue #4).
-- The label checker on a task's Machine vision card steps through an ortho's
-- labels tile by tile; the user moves a point onto its object, keeps it, or
-- rejects it. checked_at = when someone last kept/moved it; rejected labels
-- stay (so a reject can be undone) but are left out of runs and counts.
-- Safe to re-run.

ALTER TABLE "pgntarg2udzj1f3"."Vision_Labels"
  ADD COLUMN IF NOT EXISTS checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected   BOOLEAN NOT NULL DEFAULT false;
