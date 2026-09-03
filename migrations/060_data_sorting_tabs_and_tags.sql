-- Data Sorting rework: adds a "Needs Further Processing" tag to every
-- upload table, and brings Documents/Videos up to parity with the other
-- upload tables (stage + merge_group_id) so they can be grouped and tracked
-- the same way inside Data Sorting. Additive-only, safe to re-run.

ALTER TABLE "pgntarg2udzj1f3"."Photos"             ADD COLUMN IF NOT EXISTS needs_further_processing BOOLEAN DEFAULT false;
ALTER TABLE "pgntarg2udzj1f3"."Notes"              ADD COLUMN IF NOT EXISTS needs_further_processing BOOLEAN DEFAULT false;
ALTER TABLE "pgntarg2udzj1f3"."Recordings"         ADD COLUMN IF NOT EXISTS needs_further_processing BOOLEAN DEFAULT false;
ALTER TABLE "pgntarg2udzj1f3"."Locations"          ADD COLUMN IF NOT EXISTS needs_further_processing BOOLEAN DEFAULT false;
ALTER TABLE "pgntarg2udzj1f3"."Lab_Member_Uploads" ADD COLUMN IF NOT EXISTS needs_further_processing BOOLEAN DEFAULT false;
ALTER TABLE "pgntarg2udzj1f3"."Documents"          ADD COLUMN IF NOT EXISTS needs_further_processing BOOLEAN DEFAULT false;
ALTER TABLE "pgntarg2udzj1f3"."Videos"             ADD COLUMN IF NOT EXISTS needs_further_processing BOOLEAN DEFAULT false;

ALTER TABLE "pgntarg2udzj1f3"."Documents" ADD COLUMN IF NOT EXISTS stage TEXT;
ALTER TABLE "pgntarg2udzj1f3"."Documents" ADD COLUMN IF NOT EXISTS merge_group_id VARCHAR(36);

ALTER TABLE "pgntarg2udzj1f3"."Videos" ADD COLUMN IF NOT EXISTS stage TEXT;
ALTER TABLE "pgntarg2udzj1f3"."Videos" ADD COLUMN IF NOT EXISTS merge_group_id VARCHAR(36);
