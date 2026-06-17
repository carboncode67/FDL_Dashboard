-- Test_Field_Definitions: column schema for a test template
CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Test_Field_Definitions" (
  id         SERIAL PRIMARY KEY,
  test_id    INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Tests"(id) ON DELETE CASCADE,
  col_index  INT NOT NULL,
  field_type VARCHAR(10) NOT NULL DEFAULT 'text',
  label      TEXT NOT NULL,
  UNIQUE (test_id, col_index)
);

-- Experiment_Treatment_Values: per-experiment-treatment row values
CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Experiment_Treatment_Values" (
  id            SERIAL PRIMARY KEY,
  experiment_id INT NOT NULL,
  treatment_id  INT NOT NULL,
  field_def_id  INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Test_Field_Definitions"(id) ON DELETE CASCADE,
  row_index     INT NOT NULL,
  value         TEXT,
  UNIQUE (experiment_id, treatment_id, field_def_id, row_index),
  FOREIGN KEY (experiment_id, treatment_id)
    REFERENCES "pgntarg2udzj1f3"."Experiment_Treatments"(experiment_id, treatment_id) ON DELETE CASCADE
);

-- Link a treatment to a test template (optional)
ALTER TABLE "pgntarg2udzj1f3"."Treatments"
  ADD COLUMN IF NOT EXISTS test_template_id INT
    REFERENCES "pgntarg2udzj1f3"."Tests"(id) ON DELETE SET NULL;
