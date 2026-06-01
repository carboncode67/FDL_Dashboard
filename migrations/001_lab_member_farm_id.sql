-- Run against the existing DB (10.0.1.10) before pg_dump, then restore into the container.
-- All ADD COLUMN IF NOT EXISTS so it is safe to re-run.

SET search_path = "pgntarg2udzj1f3";

-- Distinguish farmer contacts from lab member contacts
ALTER TABLE "Contacts"
  ADD COLUMN IF NOT EXISTS is_lab_member BOOLEAN NOT NULL DEFAULT FALSE;

-- Direct farm association on every upload type (set at upload time via proximity or contact link)
ALTER TABLE "Photos"
  ADD COLUMN IF NOT EXISTS farm_id INTEGER REFERENCES "Farms"(id);

ALTER TABLE "Notes"
  ADD COLUMN IF NOT EXISTS farm_id INTEGER REFERENCES "Farms"(id);

ALTER TABLE "Recordings"
  ADD COLUMN IF NOT EXISTS farm_id INTEGER REFERENCES "Farms"(id);

ALTER TABLE "Locations"
  ADD COLUMN IF NOT EXISTS farm_id INTEGER REFERENCES "Farms"(id);
