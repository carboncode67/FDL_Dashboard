-- Equipment_Loans renter can now be either a farmer (Contact) or a lab
-- member/agronomist (public.users) -- previously contact_id was the only
-- option. Same "dedicated nullable FK per target kind" idiom as
-- Form_Assignments (migration 038), scaled down to 2 kinds since a checkout
-- renter is always one specific individual, never a whole farm/experiment.

ALTER TABLE "pgntarg2udzj1f3"."Equipment_Loans"
  ALTER COLUMN contact_id DROP NOT NULL;

ALTER TABLE "pgntarg2udzj1f3"."Equipment_Loans"
  ADD COLUMN IF NOT EXISTS renter_user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE "pgntarg2udzj1f3"."Equipment_Loans"
  DROP CONSTRAINT IF EXISTS equipment_loans_exactly_one_renter;
ALTER TABLE "pgntarg2udzj1f3"."Equipment_Loans"
  ADD CONSTRAINT equipment_loans_exactly_one_renter CHECK (
    (CASE WHEN contact_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN renter_user_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  );

CREATE INDEX IF NOT EXISTS idx_equipment_loans_renter_user ON "pgntarg2udzj1f3"."Equipment_Loans"(renter_user_id);
