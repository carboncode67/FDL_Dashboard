-- Planned Changes item 15/16: sampling maps currently can only be sent to lab members
-- (Sampling_Map_Assignments.user_id is a required FK, no other target columns) -- unlike
-- Forms/Geofences, which can be sent to an individual farmer (Contact), an individual lab
-- member (User), or broadly to everyone tied to a Farm or Farm_Experiment. This brings
-- Sampling_Map_Assignments up to the same shape as Geofence_Assignments (061_geofences.sql):
-- add the three missing nullable target columns, relax user_id to nullable, and enforce
-- "exactly one target set" the same way.

ALTER TABLE "pgntarg2udzj1f3"."Sampling_Map_Assignments"
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE "pgntarg2udzj1f3"."Sampling_Map_Assignments"
  ADD COLUMN IF NOT EXISTS contact_id INT REFERENCES "pgntarg2udzj1f3"."Contacts"(id) ON DELETE CASCADE;
ALTER TABLE "pgntarg2udzj1f3"."Sampling_Map_Assignments"
  ADD COLUMN IF NOT EXISTS farm_id INT REFERENCES "pgntarg2udzj1f3"."Farms"(id) ON DELETE CASCADE;
ALTER TABLE "pgntarg2udzj1f3"."Sampling_Map_Assignments"
  ADD COLUMN IF NOT EXISTS farm_experiment_id INT REFERENCES "pgntarg2udzj1f3"."Farm_Experiments"(id) ON DELETE CASCADE;

ALTER TABLE "pgntarg2udzj1f3"."Sampling_Map_Assignments"
  DROP CONSTRAINT IF EXISTS sampling_map_assignments_exactly_one_target;
ALTER TABLE "pgntarg2udzj1f3"."Sampling_Map_Assignments"
  ADD CONSTRAINT sampling_map_assignments_exactly_one_target CHECK (
    (CASE WHEN contact_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN farm_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN farm_experiment_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  );

CREATE INDEX IF NOT EXISTS idx_sampling_map_assignments_contact ON "pgntarg2udzj1f3"."Sampling_Map_Assignments"(contact_id);
CREATE INDEX IF NOT EXISTS idx_sampling_map_assignments_farm ON "pgntarg2udzj1f3"."Sampling_Map_Assignments"(farm_id);
CREATE INDEX IF NOT EXISTS idx_sampling_map_assignments_experiment ON "pgntarg2udzj1f3"."Sampling_Map_Assignments"(farm_experiment_id);
