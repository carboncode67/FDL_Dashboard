-- Add 'multiselect' to the allowed Form_Field_Definitions.field_type values.
-- A multiselect field reuses the same `options` JSONB array as 'select'; its
-- answer is stored in Form_Responses.data as a JSON array of the chosen
-- option strings (rather than a single string).

ALTER TABLE "pgntarg2udzj1f3"."Form_Field_Definitions"
  DROP CONSTRAINT IF EXISTS "Form_Field_Definitions_field_type_check";

ALTER TABLE "pgntarg2udzj1f3"."Form_Field_Definitions"
  ADD CONSTRAINT "Form_Field_Definitions_field_type_check"
  CHECK (field_type IN ('text','number','boolean','date','select','multiselect','photo'));
