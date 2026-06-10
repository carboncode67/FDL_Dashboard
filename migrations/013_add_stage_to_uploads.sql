-- Add processing stage field to all five upload tables
-- Stage values: 'Unread', 'AI Processed', 'AI Verification Needed', 'Validated'

ALTER TABLE "pgntarg2udzj1f3"."Photos" ADD COLUMN IF NOT EXISTS stage VARCHAR(50);
ALTER TABLE "pgntarg2udzj1f3"."Notes" ADD COLUMN IF NOT EXISTS stage VARCHAR(50);
ALTER TABLE "pgntarg2udzj1f3"."Recordings" ADD COLUMN IF NOT EXISTS stage VARCHAR(50);
ALTER TABLE "pgntarg2udzj1f3"."Locations" ADD COLUMN IF NOT EXISTS stage VARCHAR(50);
ALTER TABLE "pgntarg2udzj1f3"."Lab_Member_Uploads" ADD COLUMN IF NOT EXISTS stage VARCHAR(50);
