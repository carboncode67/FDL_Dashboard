-- Add Fields_id FK to Experiment_Zones
-- Run against: nocodb database, host 10.0.1.10:5432

ALTER TABLE "pgntarg2udzj1f3"."Experiment_Zones"
  ADD COLUMN "Fields_id" integer
  REFERENCES "pgntarg2udzj1f3"."Fields"(id)
  ON DELETE SET NULL;

-- After running, trigger a NocoDB Data Sources sync so the new column appears in the NocoDB UI.
