-- Ingested test data rows (Planned Changes #84)
-- data is JSONB keyed by Test_Field_Definitions.col_index (as string) so that
-- schema edits (which delete+recreate field definitions) never cascade into data.
CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Test_Data_Rows" (
  id                 SERIAL PRIMARY KEY,
  experiment_test_id INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Experiment_Tests"(id) ON DELETE CASCADE,
  row_index          INT NOT NULL,
  data               JSONB NOT NULL,
  source_file        TEXT,
  ingested_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (experiment_test_id, row_index)
);

CREATE INDEX IF NOT EXISTS idx_test_data_rows_experiment_test
  ON "pgntarg2udzj1f3"."Test_Data_Rows"(experiment_test_id);
