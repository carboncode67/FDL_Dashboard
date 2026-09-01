-- Track how many physical units of an equipment item the lab owns, so
-- signing out one unit doesn't block signing out the others. Availability
-- itself is derived (quantity minus active Equipment_Loans), not stored.

ALTER TABLE "pgntarg2udzj1f3"."Drones"
  ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 1;
