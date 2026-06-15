ALTER TABLE "pgntarg2udzj1f3"."Farm_Experiments"
  ADD COLUMN IF NOT EXISTS project_id INT REFERENCES "pgntarg2udzj1f3"."Projects"(id),
  ADD COLUMN IF NOT EXISTS end_date DATE;
