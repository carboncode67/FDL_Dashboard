-- Track when a lab member was last sent an onboarding email, mirroring
-- Contact.onboarded_at, so the Mobile App Access box can show a persistent
-- "Onboarding email sent on <date>" note instead of only a one-time toast.

ALTER TABLE "public"."users"
  ADD COLUMN IF NOT EXISTS "onboarded_at" TIMESTAMP;
