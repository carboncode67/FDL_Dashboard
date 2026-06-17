-- Supersedes 019_test_field_schema.sql.
-- Removes the test_template_id linkage from Treatments and introduces
-- Treatment_Field_Definitions owned directly by each treatment type.

-- Clean up 019 artifacts if they were ever applied
DROP TABLE IF EXISTS "pgntarg2udzj1f3"."Experiment_Treatment_Values";
DROP TABLE IF EXISTS "pgntarg2udzj1f3"."Test_Field_Definitions";

ALTER TABLE "pgntarg2udzj1f3"."Treatments"
  DROP COLUMN IF EXISTS test_template_id;

-- Field column definitions native to a treatment type
CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Treatment_Field_Definitions" (
  id           SERIAL PRIMARY KEY,
  treatment_id INT NOT NULL
    REFERENCES "pgntarg2udzj1f3"."Treatments"(id) ON DELETE CASCADE,
  col_index    INT NOT NULL,
  field_type   VARCHAR(20) NOT NULL DEFAULT 'text',
  label        TEXT NOT NULL,
  UNIQUE(treatment_id, col_index)
);

-- Whether a treatment allows adding multiple rows (e.g. cover crop mix species list)
ALTER TABLE "pgntarg2udzj1f3"."Treatments"
  ADD COLUMN IF NOT EXISTS allow_extra_rows BOOLEAN DEFAULT FALSE;

-- Per-experiment-treatment field values
CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Experiment_Treatment_Values" (
  id            SERIAL PRIMARY KEY,
  experiment_id INT NOT NULL,
  treatment_id  INT NOT NULL,
  field_def_id  INT NOT NULL
    REFERENCES "pgntarg2udzj1f3"."Treatment_Field_Definitions"(id) ON DELETE CASCADE,
  row_index     INT NOT NULL,
  value         TEXT,
  UNIQUE(experiment_id, treatment_id, field_def_id, row_index),
  FOREIGN KEY (experiment_id, treatment_id)
    REFERENCES "pgntarg2udzj1f3"."Experiment_Treatments"(experiment_id, treatment_id)
    ON DELETE CASCADE
);
