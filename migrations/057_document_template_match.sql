-- Lets an uploaded Document be auto-matched against a Data Table template
-- (Test-homed, Equipment/Drone-homed, or free-floating) by column headers,
-- the same way the pipelines feature scopes "test-data-rows" triggers to a
-- specific Data Table. data_table_id is the match; test_id/drone_id are
-- opportunistically filled in from the matched table's home so existing
-- Test/Drone detail-page Documents lists pick matched documents up too,
-- without waiting on the general data-sorting-for-documents work.
ALTER TABLE "pgntarg2udzj1f3"."Documents"
  ADD COLUMN IF NOT EXISTS data_table_id INT REFERENCES "pgntarg2udzj1f3"."Tables"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS drone_id      INT REFERENCES "pgntarg2udzj1f3"."Drones"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_data_table_id ON "pgntarg2udzj1f3"."Documents"(data_table_id);
CREATE INDEX IF NOT EXISTS idx_documents_drone_id ON "pgntarg2udzj1f3"."Documents"(drone_id);
