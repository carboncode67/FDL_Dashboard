-- Phase 1 geofencing: staff draw a polygon, assign it to an individual contact/user (or
-- broadly to a farm/experiment, same shape as Form_Assignments), and configure a simple
-- notification that fires on-device when the assignee's phone enters the polygon.
--
-- Detection is entirely client-side (hybrid architecture): a generous OS-native circular
-- region around the polygon acts as a low-battery wake trigger on both mobile platforms;
-- on wake, the device takes one fresh precise GPS fix and runs an exact point-in-polygon
-- check against the real polygon before firing anything. This table (and its assignment/
-- event tables) is config + logging only -- nothing here ever triggers server-side.
--
-- Geofences.geometry follows the same convention as Fields.geometry/Experiment_Zones.geometry:
-- a raw GeoJSON geometry object (not a Feature wrapper), stored as TEXT, never parsed at the
-- API boundary.
--
-- Geofence_Events is a log of confirmed on-device entries, written by the client AFTER its
-- precise polygon check passes -- purely additive/informational, same relationship to
-- Geofences as Form_Responses is to Forms. No server-side polygon re-validation on insert:
-- the device already did the authoritative check.

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Geofences" (
  id              SERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT,
  geometry        TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  action_type     TEXT NOT NULL DEFAULT 'notification',
  action_message  TEXT NOT NULL,
  created_by_id   TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dedicated nullable FK columns per target kind, same shape as Form_Assignments.
CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Geofence_Assignments" (
  id                 SERIAL PRIMARY KEY,
  geofence_id        INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Geofences"(id) ON DELETE CASCADE,
  contact_id         INT REFERENCES "pgntarg2udzj1f3"."Contacts"(id) ON DELETE CASCADE,
  user_id            TEXT REFERENCES public.users(id) ON DELETE CASCADE,
  farm_id            INT REFERENCES "pgntarg2udzj1f3"."Farms"(id) ON DELETE CASCADE,
  farm_experiment_id INT REFERENCES "pgntarg2udzj1f3"."Farm_Experiments"(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT geofence_assignments_exactly_one_target CHECK (
    (CASE WHEN contact_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN farm_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN farm_experiment_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_geofence_assignments_geofence ON "pgntarg2udzj1f3"."Geofence_Assignments"(geofence_id);
CREATE INDEX IF NOT EXISTS idx_geofence_assignments_contact ON "pgntarg2udzj1f3"."Geofence_Assignments"(contact_id);
CREATE INDEX IF NOT EXISTS idx_geofence_assignments_user ON "pgntarg2udzj1f3"."Geofence_Assignments"(user_id);
CREATE INDEX IF NOT EXISTS idx_geofence_assignments_farm ON "pgntarg2udzj1f3"."Geofence_Assignments"(farm_id);
CREATE INDEX IF NOT EXISTS idx_geofence_assignments_experiment ON "pgntarg2udzj1f3"."Geofence_Assignments"(farm_experiment_id);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Geofence_Events" (
  id           SERIAL PRIMARY KEY,
  geofence_id  INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Geofences"(id) ON DELETE CASCADE,
  contact_id   INT REFERENCES "pgntarg2udzj1f3"."Contacts"(id) ON DELETE SET NULL,
  user_id      TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  event_type   TEXT NOT NULL DEFAULT 'enter',
  lat          DOUBLE PRECISION NOT NULL,
  lng          DOUBLE PRECISION NOT NULL,
  occurred_at  TIMESTAMPTZ NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  content_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_geofence_events_geofence ON "pgntarg2udzj1f3"."Geofence_Events"(geofence_id);
CREATE INDEX IF NOT EXISTS idx_geofence_events_contact ON "pgntarg2udzj1f3"."Geofence_Events"(contact_id);
CREATE INDEX IF NOT EXISTS idx_geofence_events_user ON "pgntarg2udzj1f3"."Geofence_Events"(user_id);
CREATE INDEX IF NOT EXISTS idx_geofence_events_content_hash ON "pgntarg2udzj1f3"."Geofence_Events"(content_hash);
