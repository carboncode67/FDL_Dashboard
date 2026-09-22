-- Replaces the flat "every Geofence is a notify-on-entry config" model with two
-- purpose-built, mutually-exclusive types, chosen at creation and not editable
-- afterward (same "delete and recreate to change" precedent as Geofence_Zones):
--
--   'duration'     -- circle-level entry/exit is timed and logged (see migration
--                     079's Geofence_Zone_Time_Sessions); notify_on_field_entry is
--                     forced false for this type (no field-precision duration yet).
--   'notification' -- today's existing behavior: notify_on_circle_entry/
--                     notify_on_field_entry fire a plain alert, optionally deep-
--                     linking to one Form or one Sampling Map.
--
-- circle_repeat_interval_days/field_repeat_interval_days replace the old flat
-- 30-minute client-hardcoded debounce with a real per-geofence, day-granularity
-- minimum repeat interval for each trigger kind -- a re-entry within the window
-- still gets logged (Geofence_Events / Geofence_Zone_Time_Sessions), only the
-- user-facing notification is throttled (enforced entirely client-side, same as
-- every other detection/timing decision on this feature).
--
-- linked_form_id/linked_sampling_map_id are optional and mutually exclusive, and
-- only meaningful for 'notification' type geofences.
--
-- Safe to re-run: ADD COLUMN uses IF NOT EXISTS; constraint guards check
-- pg_constraint first (Postgres has no ADD CONSTRAINT IF NOT EXISTS), same idiom
-- as migration 069.

ALTER TABLE "pgntarg2udzj1f3"."Geofences" ADD COLUMN IF NOT EXISTS geofence_type TEXT NOT NULL DEFAULT 'notification';
ALTER TABLE "pgntarg2udzj1f3"."Geofences" ADD COLUMN IF NOT EXISTS circle_repeat_interval_days INT NOT NULL DEFAULT 1;
ALTER TABLE "pgntarg2udzj1f3"."Geofences" ADD COLUMN IF NOT EXISTS field_repeat_interval_days INT NOT NULL DEFAULT 1;
ALTER TABLE "pgntarg2udzj1f3"."Geofences" ADD COLUMN IF NOT EXISTS linked_form_id INT REFERENCES "pgntarg2udzj1f3"."Forms"(id) ON DELETE SET NULL;
ALTER TABLE "pgntarg2udzj1f3"."Geofences" ADD COLUMN IF NOT EXISTS linked_sampling_map_id INT REFERENCES "pgntarg2udzj1f3"."Sampling_Maps"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_geofences_linked_form ON "pgntarg2udzj1f3"."Geofences"(linked_form_id);
CREATE INDEX IF NOT EXISTS idx_geofences_linked_sampling_map ON "pgntarg2udzj1f3"."Geofences"(linked_sampling_map_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'geofences_type_check') THEN
    ALTER TABLE "pgntarg2udzj1f3"."Geofences"
      ADD CONSTRAINT geofences_type_check CHECK (geofence_type IN ('duration', 'notification'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'geofences_intervals_positive') THEN
    ALTER TABLE "pgntarg2udzj1f3"."Geofences"
      ADD CONSTRAINT geofences_intervals_positive CHECK (circle_repeat_interval_days >= 1 AND field_repeat_interval_days >= 1);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'geofences_link_exclusive') THEN
    ALTER TABLE "pgntarg2udzj1f3"."Geofences"
      ADD CONSTRAINT geofences_link_exclusive CHECK (linked_form_id IS NULL OR linked_sampling_map_id IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'geofences_link_only_notification') THEN
    ALTER TABLE "pgntarg2udzj1f3"."Geofences"
      ADD CONSTRAINT geofences_link_only_notification CHECK (
        geofence_type = 'notification' OR (linked_form_id IS NULL AND linked_sampling_map_id IS NULL)
      );
  END IF;
END $$;

-- Existing rows predate the type distinction and already behave like today's
-- notification geofences -- the column DEFAULT already covers them, this UPDATE
-- is just belt-and-suspenders for any row inserted between deploy and migration.
UPDATE "pgntarg2udzj1f3"."Geofences" SET geofence_type = 'notification' WHERE geofence_type IS NULL;
