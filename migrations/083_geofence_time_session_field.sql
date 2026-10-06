-- Per-field time tracking for 'duration' Geofences. A Geofence_Zones row is a circle drawn
-- around one or more Fields on a farm, so a session keyed only by zone_id lumped every field
-- inside that circle into one number. field_id records which field polygon the device was
-- actually standing in for that session; NULL = zone-circle-level session (zones with no
-- fields, or sessions logged by app builds that predate this column).
--
-- Purely additive; safe to re-run. Run against BOTH FDL instances.

ALTER TABLE "pgntarg2udzj1f3"."Geofence_Zone_Time_Sessions"
  ADD COLUMN IF NOT EXISTS field_id INT REFERENCES "pgntarg2udzj1f3"."Fields"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_geofence_zone_time_sessions_field
  ON "pgntarg2udzj1f3"."Geofence_Zone_Time_Sessions"(field_id);
