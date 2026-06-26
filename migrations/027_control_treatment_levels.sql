ALTER TABLE "pgntarg2udzj1f3"."Experiment_Treatments"
  ADD COLUMN IF NOT EXISTS has_control_treatment    BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS control_treatment_type   VARCHAR(20),
  ADD COLUMN IF NOT EXISTS control_treatment_number INTEGER;
