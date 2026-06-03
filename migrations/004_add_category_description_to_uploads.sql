-- Add category, description, and project assignment to all FDL upload tables.
-- These are filled in via the Data Sorting UI; setting them advances status to 3.

ALTER TABLE pgntarg2udzj1f3."Photos"
  ADD COLUMN IF NOT EXISTS category    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS project_id  INTEGER REFERENCES pgntarg2udzj1f3."Projects"(id) ON DELETE SET NULL;

ALTER TABLE pgntarg2udzj1f3."Notes"
  ADD COLUMN IF NOT EXISTS category    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS project_id  INTEGER REFERENCES pgntarg2udzj1f3."Projects"(id) ON DELETE SET NULL;

ALTER TABLE pgntarg2udzj1f3."Recordings"
  ADD COLUMN IF NOT EXISTS category    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS project_id  INTEGER REFERENCES pgntarg2udzj1f3."Projects"(id) ON DELETE SET NULL;

ALTER TABLE pgntarg2udzj1f3."Locations"
  ADD COLUMN IF NOT EXISTS category    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS project_id  INTEGER REFERENCES pgntarg2udzj1f3."Projects"(id) ON DELETE SET NULL;

ALTER TABLE pgntarg2udzj1f3."Lab_Member_Uploads"
  ADD COLUMN IF NOT EXISTS category    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS project_id  INTEGER REFERENCES pgntarg2udzj1f3."Projects"(id) ON DELETE SET NULL;
