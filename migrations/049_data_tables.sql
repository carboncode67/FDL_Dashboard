-- Promotes the test data-template/rows concept into its own reusable
-- "Tables" (DataTable) entity: a named schema that can be homed to a Test,
-- homed to an Equipment (Drone) item, or float free as a shared library
-- entry, and can be used by many Tests via _nc_m2m_Tests_Tables. Replaces
-- the old one-schema-per-Test assumption (Test_Field_Definitions /
-- Test_Data_Rows / Tests.Data_Processing_Instructions / Pipelines.match_test_id),
-- but this file only ADDS the new tables and copies existing data over —
-- it does not touch the old columns/tables. Additive-only, safe to run
-- while the currently-deployed app (which still reads the old columns) is
-- live. The old columns/tables are dropped separately in
-- 050_drop_legacy_test_schema.sql, only after the new app code is deployed.

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Tables" (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  data_processing_instructions TEXT,
  test_id INT REFERENCES "pgntarg2udzj1f3"."Tests"(id) ON DELETE SET NULL,
  drone_id INT REFERENCES "pgntarg2udzj1f3"."Drones"(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tables_at_most_one_home CHECK (test_id IS NULL OR drone_id IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_tables_test ON "pgntarg2udzj1f3"."Tables"(test_id);
CREATE INDEX IF NOT EXISTS idx_tables_drone ON "pgntarg2udzj1f3"."Tables"(drone_id);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Data_Table_Field_Definitions" (
  id SERIAL PRIMARY KEY,
  data_table_id INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Tables"(id) ON DELETE CASCADE,
  col_index INT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text',
  label TEXT NOT NULL,
  UNIQUE (data_table_id, col_index)
);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Data_Table_Rows" (
  id SERIAL PRIMARY KEY,
  data_table_id INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Tables"(id) ON DELETE CASCADE,
  experiment_test_id INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Experiment_Tests"(id) ON DELETE CASCADE,
  row_index INT NOT NULL,
  data JSONB NOT NULL,
  source_file TEXT,
  ingested_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (data_table_id, experiment_test_id, row_index)
);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."_nc_m2m_Tests_Tables" (
  "Tests_id" INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Tests"(id) ON DELETE CASCADE,
  "Tables_id" INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Tables"(id) ON DELETE CASCADE,
  PRIMARY KEY ("Tests_id", "Tables_id")
);

ALTER TABLE "pgntarg2udzj1f3"."Pipelines"
  ADD COLUMN IF NOT EXISTS match_data_table_id INT;

-- Data migration: one DataTable per existing Test that has a data template
-- or processing instructions. Today's data is 1:1 test->schema, so every
-- join below is unambiguous; each step is guarded so this file stays safe
-- to re-run.

INSERT INTO "pgntarg2udzj1f3"."Tables" (name, data_processing_instructions, test_id)
SELECT COALESCE(t."Test_Name", 'Test ' || t.id), t."Data_Processing_Instructions", t.id
FROM "pgntarg2udzj1f3"."Tests" t
WHERE (
  EXISTS (SELECT 1 FROM "pgntarg2udzj1f3"."Test_Field_Definitions" tfd WHERE tfd.test_id = t.id)
  OR t."Data_Processing_Instructions" IS NOT NULL
)
AND NOT EXISTS (SELECT 1 FROM "pgntarg2udzj1f3"."Tables" dt WHERE dt.test_id = t.id);

INSERT INTO "pgntarg2udzj1f3"."Data_Table_Field_Definitions" (data_table_id, col_index, field_type, label)
SELECT dt.id, tfd.col_index, tfd.field_type, tfd.label
FROM "pgntarg2udzj1f3"."Test_Field_Definitions" tfd
JOIN "pgntarg2udzj1f3"."Tables" dt ON dt.test_id = tfd.test_id
WHERE NOT EXISTS (
  SELECT 1 FROM "pgntarg2udzj1f3"."Data_Table_Field_Definitions" existing
  WHERE existing.data_table_id = dt.id AND existing.col_index = tfd.col_index
);

INSERT INTO "pgntarg2udzj1f3"."Data_Table_Rows" (data_table_id, experiment_test_id, row_index, data, source_file, ingested_at)
SELECT dt.id, tdr.experiment_test_id, tdr.row_index, tdr.data, tdr.source_file, tdr.ingested_at
FROM "pgntarg2udzj1f3"."Test_Data_Rows" tdr
JOIN "pgntarg2udzj1f3"."Experiment_Tests" et ON et.id = tdr.experiment_test_id
JOIN "pgntarg2udzj1f3"."Tables" dt ON dt.test_id = et.test_id
WHERE NOT EXISTS (
  SELECT 1 FROM "pgntarg2udzj1f3"."Data_Table_Rows" existing
  WHERE existing.data_table_id = dt.id
    AND existing.experiment_test_id = tdr.experiment_test_id
    AND existing.row_index = tdr.row_index
);

UPDATE "pgntarg2udzj1f3"."Pipelines" p
SET match_data_table_id = dt.id
FROM "pgntarg2udzj1f3"."Tables" dt
WHERE dt.test_id = p.match_test_id
  AND p.match_table = 'test-data-rows'
  AND p.match_data_table_id IS NULL;
