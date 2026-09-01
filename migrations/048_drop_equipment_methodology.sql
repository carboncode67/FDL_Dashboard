-- Equipment-level Methodology (added in 047) turned out redundant: a
-- device shared across many tests has a different procedure per test (no
-- single "the" methodology), and a device dedicated to one test just
-- duplicates that test's own methodology. Methodology now lives only on
-- Tests; the shared Methodologies library still covers reuse across tests.

ALTER TABLE "pgntarg2udzj1f3"."Drones"
  DROP COLUMN IF EXISTS methodology_id,
  DROP COLUMN IF EXISTS "Methodology";
