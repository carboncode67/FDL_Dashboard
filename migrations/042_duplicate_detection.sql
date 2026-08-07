-- Server-side possible-duplicate detection.
-- Photos: pHash (dHash) similarity. Recordings: length + timestamp + position
-- heuristic. Matches never auto-delete -- they set possible_duplicate_of for
-- review in the Data Sorting dashboard (see lib/duplicate-detection.ts).

ALTER TABLE "pgntarg2udzj1f3"."Recordings"         ADD COLUMN IF NOT EXISTS start_latitude FLOAT;
ALTER TABLE "pgntarg2udzj1f3"."Recordings"         ADD COLUMN IF NOT EXISTS start_longitude FLOAT;

ALTER TABLE "pgntarg2udzj1f3"."Photos"             ADD COLUMN IF NOT EXISTS phash TEXT;
ALTER TABLE "pgntarg2udzj1f3"."Lab_Member_Uploads" ADD COLUMN IF NOT EXISTS phash TEXT;

ALTER TABLE "pgntarg2udzj1f3"."Photos"             ADD COLUMN IF NOT EXISTS possible_duplicate_of INTEGER;
ALTER TABLE "pgntarg2udzj1f3"."Recordings"         ADD COLUMN IF NOT EXISTS possible_duplicate_of INTEGER;
ALTER TABLE "pgntarg2udzj1f3"."Lab_Member_Uploads" ADD COLUMN IF NOT EXISTS possible_duplicate_of INTEGER;

ALTER TABLE "pgntarg2udzj1f3"."Photos"             ADD COLUMN IF NOT EXISTS duplicate_dismissed BOOLEAN DEFAULT false;
ALTER TABLE "pgntarg2udzj1f3"."Recordings"         ADD COLUMN IF NOT EXISTS duplicate_dismissed BOOLEAN DEFAULT false;
ALTER TABLE "pgntarg2udzj1f3"."Lab_Member_Uploads" ADD COLUMN IF NOT EXISTS duplicate_dismissed BOOLEAN DEFAULT false;
