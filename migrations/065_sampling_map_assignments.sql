-- Mobile phase for Planned Changes item 4: get a sampling map from the Dashboard onto a lab
-- member's phone. Sampling maps are lab-member-only work (no farmer/Contact/Twilio channel
-- involved, unlike Forms/Geofences), so assignment is a straight user_id FK -- no
-- exactly-one-of-N target CHECK constraint needed like Geofence_Assignments/Form_Assignments.
--
-- Sampling_Point_Collections is an event log (one row per on-device "mark collected" action),
-- same relationship to Sampling_Points as Geofence_Events is to Geofences -- not a mutable
-- `collected` boolean on Sampling_Points, so re-collection history is preserved. "Is this point
-- collected" is derived (client- and server-side) as "does at least one collection row exist."
-- content_hash follows the same client-computed dedup convention as Notes/Locations/
-- Geofence_Events; lat/lng are the device's actual fix at collection time (not copied from the
-- point's planned geometry), letting staff later compare planned vs. actual sample location.

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Sampling_Map_Assignments" (
  id              SERIAL PRIMARY KEY,
  sampling_map_id INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Sampling_Maps"(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sampling_map_assignments_map ON "pgntarg2udzj1f3"."Sampling_Map_Assignments"(sampling_map_id);
CREATE INDEX IF NOT EXISTS idx_sampling_map_assignments_user ON "pgntarg2udzj1f3"."Sampling_Map_Assignments"(user_id);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Sampling_Point_Collections" (
  id                 SERIAL PRIMARY KEY,
  sampling_point_id  INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Sampling_Points"(id) ON DELETE CASCADE,
  user_id            TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  lat                DOUBLE PRECISION NOT NULL,
  lng                DOUBLE PRECISION NOT NULL,
  occurred_at        TIMESTAMPTZ NOT NULL,
  note               TEXT,
  content_hash       TEXT,
  received_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sampling_point_collections_point ON "pgntarg2udzj1f3"."Sampling_Point_Collections"(sampling_point_id);
CREATE INDEX IF NOT EXISTS idx_sampling_point_collections_hash ON "pgntarg2udzj1f3"."Sampling_Point_Collections"(content_hash);
