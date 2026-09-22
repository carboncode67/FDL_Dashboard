-- Server-side counterpart of the Swift app's local Geofence_Zone_Time_Sessions
-- table (already built client-side, ahead of the server — see docs/geofences).
-- One row per confirmed circle entry/exit pair for a 'duration' type Geofence,
-- POSTed by the device after it closes the session locally. Purely additive/
-- informational, same relationship to Geofences as Geofence_Events -- no
-- completion semantics, no server-side re-validation of the reported duration.
--
-- Child table (no own lab_id), RLS scoped via geofence_id -> Geofences, same
-- pattern as Geofence_Events in migration 071.

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Geofence_Zone_Time_Sessions" (
  id               SERIAL PRIMARY KEY,
  geofence_id      INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Geofences"(id) ON DELETE CASCADE,
  zone_id          INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Geofence_Zones"(id) ON DELETE CASCADE,
  contact_id       INT REFERENCES "pgntarg2udzj1f3"."Contacts"(id) ON DELETE SET NULL,
  user_id          TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  entered_at       TIMESTAMPTZ NOT NULL,
  exited_at        TIMESTAMPTZ NOT NULL,
  duration_seconds INT NOT NULL,
  content_hash     TEXT,
  received_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geofence_zone_time_sessions_geofence ON "pgntarg2udzj1f3"."Geofence_Zone_Time_Sessions"(geofence_id);
CREATE INDEX IF NOT EXISTS idx_geofence_zone_time_sessions_zone ON "pgntarg2udzj1f3"."Geofence_Zone_Time_Sessions"(zone_id);
CREATE INDEX IF NOT EXISTS idx_geofence_zone_time_sessions_contact ON "pgntarg2udzj1f3"."Geofence_Zone_Time_Sessions"(contact_id);
CREATE INDEX IF NOT EXISTS idx_geofence_zone_time_sessions_user ON "pgntarg2udzj1f3"."Geofence_Zone_Time_Sessions"(user_id);
CREATE INDEX IF NOT EXISTS idx_geofence_zone_time_sessions_content_hash ON "pgntarg2udzj1f3"."Geofence_Zone_Time_Sessions"(content_hash);

DO $$
BEGIN
  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Geofence_Zone_Time_Sessions" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Geofence_Zone_Time_Sessions' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Geofence_Zone_Time_Sessions" USING ("geofence_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Geofences")) WITH CHECK ("geofence_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Geofences"))$sql$;
  END IF;
END $$;
