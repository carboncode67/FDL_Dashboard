-- Shared Methodology library. Tests and Equipment (Drones) can each link to
-- a library entry via methodology_id (live reference -- editing the library
-- entry updates everywhere it's linked); their own free-text "Methodology"
-- column now doubles as a per-record override that takes precedence when set.
-- Also declares which Equipment items a Test requires, so lab members know
-- what to sign out before running it -- purely declarative, does not touch
-- Equipment_Loans sign-out tracking.

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Methodologies" (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "pgntarg2udzj1f3"."Tests"
  ADD COLUMN IF NOT EXISTS methodology_id INT REFERENCES "pgntarg2udzj1f3"."Methodologies"(id) ON DELETE SET NULL;

ALTER TABLE "pgntarg2udzj1f3"."Drones"
  ADD COLUMN IF NOT EXISTS "Methodology" TEXT,
  ADD COLUMN IF NOT EXISTS methodology_id INT REFERENCES "pgntarg2udzj1f3"."Methodologies"(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."_nc_m2m_Tests_Drones" (
  "Tests_id" INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Tests"(id) ON DELETE CASCADE,
  "Drones_id" INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Drones"(id) ON DELETE CASCADE,
  PRIMARY KEY ("Tests_id", "Drones_id")
);
