-- Add status flag to all FDL upload tables.
-- 1 = no project linkage (outside/far from any farm polygon)
-- 2 = linked to a farm (spatial or farmer-uploaded) — DEFAULT for farmer contacts
-- 3 = manually assigned category + description (pending human review)
-- 4 = fully processed

ALTER TABLE pgntarg2udzj1f3."Photos"     ADD COLUMN IF NOT EXISTS status INTEGER NOT NULL DEFAULT 2;
ALTER TABLE pgntarg2udzj1f3."Recordings" ADD COLUMN IF NOT EXISTS status INTEGER NOT NULL DEFAULT 2;
ALTER TABLE pgntarg2udzj1f3."Notes"      ADD COLUMN IF NOT EXISTS status INTEGER NOT NULL DEFAULT 2;
ALTER TABLE pgntarg2udzj1f3."Locations"  ADD COLUMN IF NOT EXISTS status INTEGER NOT NULL DEFAULT 2;
