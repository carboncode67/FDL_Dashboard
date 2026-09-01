-- Generic cross-system identity link on Contacts, so an external system
-- (e.g. OFE Dashboard) can mint-once/reuse the same FDL Contact for a given
-- external user rather than creating a new one per submission. Not specific
-- to OFE -- any external integration can use its own "<system>:<id>" prefix.
-- Additive-only, safe to re-run.

ALTER TABLE "pgntarg2udzj1f3"."Contacts" ADD COLUMN IF NOT EXISTS external_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_external_ref
  ON "pgntarg2udzj1f3"."Contacts"(external_ref);
