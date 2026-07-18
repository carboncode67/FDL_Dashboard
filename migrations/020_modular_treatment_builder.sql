-- Supersedes 019_test_field_schema.sql.
-- Removes the test_template_id linkage from Treatments and introduces
-- Treatment_Field_Definitions owned directly by each treatment type.

-- Clean up 019 artifacts if they were ever applied.
-- NOTE: Test_Field_Definitions is intentionally NOT dropped — the test Data
-- Template builder (tests/[id]/edit) now uses it, and re-running the full
-- migration set must not wipe it. Only drop Experiment_Treatment_Values when
-- it still carries the old 019 FK to Test_Field_Definitions.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_schema = 'pgntarg2udzj1f3'
      AND table_name = 'Test_Field_Definitions'
      AND constraint_name IN (
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_schema = 'pgntarg2udzj1f3'
          AND table_name = 'Experiment_Treatment_Values'
          AND constraint_type = 'FOREIGN KEY'
      )
  ) THEN
    DROP TABLE "pgntarg2udzj1f3"."Experiment_Treatment_Values";
  END IF;
END $$;

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
