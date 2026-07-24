-- Add 'photo' to the allowed Form_Field_Definitions.field_type values.
-- Missed when the photo field type was added at the Prisma/app layer --
-- migration 038's CHECK constraint still only allowed text/number/boolean/
-- date/select, so any schema save containing a photo field was rejected by
-- Postgres. Because the schema PUT route deletes existing field defs before
-- re-inserting the new set (not inside a transaction), a rejected insert
-- left the affected form with zero fields instead of failing cleanly and
-- leaving the old fields in place.

ALTER TABLE "pgntarg2udzj1f3"."Form_Field_Definitions"
  DROP CONSTRAINT IF EXISTS "Form_Field_Definitions_field_type_check";

ALTER TABLE "pgntarg2udzj1f3"."Form_Field_Definitions"
  ADD CONSTRAINT "Form_Field_Definitions_field_type_check"
  CHECK (field_type IN ('text','number','boolean','date','select','photo'));
