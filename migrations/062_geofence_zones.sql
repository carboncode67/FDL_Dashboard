-- Phase 2 geofencing: replaces Phase 1's freehand-polygon Geofence with a zone model. A
-- Geofence now holds one or more Geofence_Zones, each a farm-scoped circle (staff-adjustable
-- center/radius, seeded server-side from the bounding circle of selected Fields) covering one
-- or more Fields on that farm via Geofence_Zone_Fields. notify_on_circle_entry/
-- notify_on_field_entry replace action_type -- both flags are geofence-level (apply to every
-- zone) and independently toggle whether a zone's circle-entry and/or exact-field-entry fires
-- a notification.
--
-- Clean-replacement migration: Phase 1 (migration 061) has only run against local dev so far,
-- no real production geofences exist yet, so geometry/action_type are dropped outright rather
-- than preserved for back-compat.

ALTER TABLE "pgntarg2udzj1f3"."Geofences" DROP COLUMN IF EXISTS geometry;
ALTER TABLE "pgntarg2udzj1f3"."Geofences" DROP COLUMN IF EXISTS action_type;
ALTER TABLE "pgntarg2udzj1f3"."Geofences" ALTER COLUMN action_message DROP NOT NULL;
ALTER TABLE "pgntarg2udzj1f3"."Geofences" ADD COLUMN IF NOT EXISTS notify_on_circle_entry BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "pgntarg2udzj1f3"."Geofences" ADD COLUMN IF NOT EXISTS notify_on_field_entry BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Geofence_Zones" (
  id            SERIAL PRIMARY KEY,
  geofence_id   INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Geofences"(id) ON DELETE CASCADE,
  farm_id       INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Farms"(id) ON DELETE CASCADE,
  center_lat    DOUBLE PRECISION NOT NULL,
  center_lng    DOUBLE PRECISION NOT NULL,
  radius_meters DOUBLE PRECISION NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geofence_zones_geofence ON "pgntarg2udzj1f3"."Geofence_Zones"(geofence_id);
CREATE INDEX IF NOT EXISTS idx_geofence_zones_farm ON "pgntarg2udzj1f3"."Geofence_Zones"(farm_id);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Geofence_Zone_Fields" (
  zone_id  INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Geofence_Zones"(id) ON DELETE CASCADE,
  field_id INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Fields"(id) ON DELETE CASCADE,
  PRIMARY KEY (zone_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_geofence_zone_fields_field ON "pgntarg2udzj1f3"."Geofence_Zone_Fields"(field_id);
