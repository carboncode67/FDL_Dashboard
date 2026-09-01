-- Drops the legacy one-schema-per-Test columns/tables now that their data
-- has been copied into Tables/Data_Table_Field_Definitions/Data_Table_Rows
-- by 049_data_tables.sql. DESTRUCTIVE — unlike most migrations in this repo,
-- do NOT run this immediately after 049. Run it only once the app build
-- that stops reading Test_Field_Definitions/Test_Data_Rows/
-- Tests.Data_Processing_Instructions/Pipelines.match_test_id is deployed and
-- verified, on both instances. Running this before that deploy will 500 any
-- in-flight request against the old columns/tables.

DROP TABLE IF EXISTS "pgntarg2udzj1f3"."Test_Data_Rows";
DROP TABLE IF EXISTS "pgntarg2udzj1f3"."Test_Field_Definitions";

ALTER TABLE "pgntarg2udzj1f3"."Tests"
  DROP COLUMN IF EXISTS "Data_Processing_Instructions";

ALTER TABLE "pgntarg2udzj1f3"."Pipelines"
  DROP COLUMN IF EXISTS match_test_id;
