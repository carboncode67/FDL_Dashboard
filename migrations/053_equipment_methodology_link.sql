-- Re-adds an OPTIONAL Methodology link on Equipment (Drones), narrower than
-- the version migration 047 added and 048 removed. 048's reasoning still
-- holds -- there is no single "the" procedure for a shared device -- so this
-- is a plain reference link only: "the methodology usually run with this
-- instrument", with no per-equipment override text (that column stays
-- dropped). A Test that requires the instrument keeps its own, separate
-- methodology; the two are not expected to match.

ALTER TABLE "pgntarg2udzj1f3"."Drones"
  ADD COLUMN IF NOT EXISTS methodology_id INT
    REFERENCES "pgntarg2udzj1f3"."Methodologies"(id) ON DELETE SET NULL;
