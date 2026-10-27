-- Stable Custom Form field identity, so editing a form never loses or scrambles answers.
--
-- Before this, Form_Responses.data was keyed by Form_Field_Definitions.col_index, and every
-- schema save delete+recreated all field defs renumbered 0..n by position. Removing or
-- reordering a field therefore re-pointed every existing response's answers at the wrong
-- field (or at none), and renaming one made queued offline submissions — matched by label —
-- silently drop that answer.
--
-- Now:
--   * field_key  — permanent per-field id; Form_Responses.data is keyed by it. Backfilled
--                  to col_index::text, which is exactly what existing data is keyed by, so
--                  every existing response keeps resolving to the field it resolves to today.
--                  New fields get 'f_<random>' keys (lib/form-fields.ts), never numeric, so
--                  they can't collide with a backfilled key. col_index is display order only.
--   * archived_at — a field removed in the builder while responses still hold answers for it
--                  is archived instead of deleted: hidden from the apps' schema, still shown
--                  (marked removed) in the responses view / CSV exports, and still matched
--                  by label for queued submissions from before the removal.
--   * previous_labels — every label a field has had, so a submission queued before a rename
--                  still lands on the right field.
--   * Form_Responses.older_form_version / missing_required — a submission that used an old
--                  label or archived field, or lacks a since-added required answer, is now
--                  accepted and flagged instead of being rejected with a 422 forever.
--
-- Safe to re-run.

ALTER TABLE "pgntarg2udzj1f3"."Form_Field_Definitions" ADD COLUMN IF NOT EXISTS field_key TEXT;
UPDATE "pgntarg2udzj1f3"."Form_Field_Definitions" SET field_key = col_index::text WHERE field_key IS NULL;
ALTER TABLE "pgntarg2udzj1f3"."Form_Field_Definitions" ALTER COLUMN field_key SET NOT NULL;
ALTER TABLE "pgntarg2udzj1f3"."Form_Field_Definitions" ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE "pgntarg2udzj1f3"."Form_Field_Definitions" ADD COLUMN IF NOT EXISTS previous_labels TEXT[] NOT NULL DEFAULT '{}';

-- col_index is display order now, and archived fields keep their last position; uniqueness
-- moves to field_key. (Dropping first also lets a save reorder fields in place.)
ALTER TABLE "pgntarg2udzj1f3"."Form_Field_Definitions" DROP CONSTRAINT IF EXISTS "Form_Field_Definitions_form_id_col_index_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Form_Field_Definitions_form_id_field_key_key"
  ON "pgntarg2udzj1f3"."Form_Field_Definitions"(form_id, field_key);

ALTER TABLE "pgntarg2udzj1f3"."Form_Responses" ADD COLUMN IF NOT EXISTS older_form_version BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pgntarg2udzj1f3"."Form_Responses" ADD COLUMN IF NOT EXISTS missing_required TEXT[] NOT NULL DEFAULT '{}';
