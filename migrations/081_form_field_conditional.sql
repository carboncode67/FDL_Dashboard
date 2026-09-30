-- Conditional display for Custom Forms fields: a field can be shown only
-- when another field in the same form has a specific answer (single
-- equality check, e.g. "Cover crops present? No/Yes" -> Yes reveals
-- "What species?"). Referenced by the parent's label, not col_index, since
-- col_index is reassigned on every reorder/add/remove in the builder UI and
-- label is already this feature's effective identity elsewhere (see
-- app/api/forms/[id]/schema/route.ts's duplicate-label check).

ALTER TABLE "pgntarg2udzj1f3"."Form_Field_Definitions"
  ADD COLUMN IF NOT EXISTS show_when_label TEXT;
ALTER TABLE "pgntarg2udzj1f3"."Form_Field_Definitions"
  ADD COLUMN IF NOT EXISTS show_when_value TEXT;
