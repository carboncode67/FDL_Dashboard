-- Phase 3 of docs/lab-data-silo-plan.md. Follows migration 070 (RLS on root
-- + library tables). Enables RLS on every remaining table in
-- "pgntarg2udzj1f3" — all of them children with no own lab_id column, scoped
-- via a subquery against their parent (or, for the handful of "exactly one of
-- several nullable FKs" assignment-style tables, an OR across each possible
-- parent). Postgres composes these correctly however many hops deep, because
-- each subquery is itself subject to its own table's RLS policy.
--
-- Table -> linking column(s) was derived from information_schema foreign keys
-- plus prisma/schema.prisma for the handful of relations with no DB-level FK
-- constraint (this schema predates most of them being added formally).
--
-- Safe to re-run: ENABLE ROW LEVEL SECURITY and CREATE POLICY are guarded by
-- existence checks below.

DO $$
BEGIN
  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Annotations" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Annotations' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Annotations" USING ("cvat_task_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Cvat_Tasks")) WITH CHECK ("cvat_task_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Cvat_Tasks"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Category_Metrics" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Category_Metrics' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Category_Metrics" USING ("category_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Upload_Categories")) WITH CHECK ("category_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Upload_Categories"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Context_Fetch_Jobs" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Context_Fetch_Jobs' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Context_Fetch_Jobs" USING ("farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms")) WITH CHECK ("farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Context_Rasters" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Context_Rasters' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Context_Rasters" USING ("farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms")) WITH CHECK ("farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Cvat_Tasks" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Cvat_Tasks' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Cvat_Tasks" USING ("project_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Projects")) WITH CHECK ("project_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Projects"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Data_Table_Field_Definitions" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Data_Table_Field_Definitions' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Data_Table_Field_Definitions" USING ("data_table_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Tables")) WITH CHECK ("data_table_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Tables"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Data_Table_Rows" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Data_Table_Rows' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Data_Table_Rows" USING ("data_table_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Tables")) WITH CHECK ("data_table_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Tables"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Drone_Flight_Polygons" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Drone_Flight_Polygons' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Drone_Flight_Polygons" USING ("flight_record_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Drone_Flight_Records")) WITH CHECK ("flight_record_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Drone_Flight_Records"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Drone_Flight_Records" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Drone_Flight_Records' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Drone_Flight_Records" USING ("experiment_drone_flight_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Experiment_Drone_Flights")) WITH CHECK ("experiment_drone_flight_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Experiment_Drone_Flights"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Dualex" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Dualex' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Dualex" USING ("Fields_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Fields")) WITH CHECK ("Fields_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Fields"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Experiment_Drone_Flights" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Experiment_Drone_Flights' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Experiment_Drone_Flights" USING ("experiment_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farm_Experiments")) WITH CHECK ("experiment_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farm_Experiments"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Experiment_Fields" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Experiment_Fields' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Experiment_Fields" USING ("experiment_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farm_Experiments")) WITH CHECK ("experiment_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farm_Experiments"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Experiment_Tests" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Experiment_Tests' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Experiment_Tests" USING ("experiment_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farm_Experiments")) WITH CHECK ("experiment_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farm_Experiments"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Experiment_Treatment_Values" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Experiment_Treatment_Values' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Experiment_Treatment_Values" USING ("experiment_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Experiment_Treatments")) WITH CHECK ("experiment_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Experiment_Treatments"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Experiment_Treatments" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Experiment_Treatments' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Experiment_Treatments" USING ("experiment_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farm_Experiments")) WITH CHECK ("experiment_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farm_Experiments"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Experiment_Zones" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Experiment_Zones' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Experiment_Zones" USING ("farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms")) WITH CHECK ("farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Farm_Experiments" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Farm_Experiments' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Farm_Experiments" USING ("farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms")) WITH CHECK ("farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Fields" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Fields' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Fields" USING ("Farms_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms")) WITH CHECK ("Farms_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Form_Assignments" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Form_Assignments' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Form_Assignments" USING ("contact_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Contacts") OR "farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms") OR "farm_experiment_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farm_Experiments") OR "form_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Forms")) WITH CHECK ("contact_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Contacts") OR "farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms") OR "farm_experiment_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farm_Experiments") OR "form_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Forms"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Form_Field_Definitions" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Form_Field_Definitions' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Form_Field_Definitions" USING ("form_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Forms")) WITH CHECK ("form_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Forms"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Form_Responses" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Form_Responses' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Form_Responses" USING ("form_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Forms")) WITH CHECK ("form_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Forms"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Geofence_Assignments" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Geofence_Assignments' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Geofence_Assignments" USING ("contact_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Contacts") OR "farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms") OR "farm_experiment_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farm_Experiments") OR "geofence_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Geofences")) WITH CHECK ("contact_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Contacts") OR "farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms") OR "farm_experiment_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farm_Experiments") OR "geofence_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Geofences"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Geofence_Events" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Geofence_Events' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Geofence_Events" USING ("geofence_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Geofences")) WITH CHECK ("geofence_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Geofences"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Geofence_Zone_Fields" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Geofence_Zone_Fields' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Geofence_Zone_Fields" USING ("zone_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Geofence_Zones")) WITH CHECK ("zone_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Geofence_Zones"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Geofence_Zones" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Geofence_Zones' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Geofence_Zones" USING ("farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms")) WITH CHECK ("farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Interview_Chunks" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Interview_Chunks' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Interview_Chunks" USING ("farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms")) WITH CHECK ("farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Pipeline_Output_Rasters" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Pipeline_Output_Rasters' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Pipeline_Output_Rasters" USING ("farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms")) WITH CHECK ("farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Pipeline_Runs" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Pipeline_Runs' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Pipeline_Runs" USING ("pipeline_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Pipelines")) WITH CHECK ("pipeline_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Pipelines"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Sampling_Map_Assignments" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Sampling_Map_Assignments' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Sampling_Map_Assignments" USING ("sampling_map_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Sampling_Maps")) WITH CHECK ("sampling_map_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Sampling_Maps"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Sampling_Map_Polygons" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Sampling_Map_Polygons' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Sampling_Map_Polygons" USING ("sampling_map_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Sampling_Maps")) WITH CHECK ("sampling_map_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Sampling_Maps"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Sampling_Point_Collections" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Sampling_Point_Collections' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Sampling_Point_Collections" USING ("sampling_point_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Sampling_Points")) WITH CHECK ("sampling_point_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Sampling_Points"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Sampling_Points" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Sampling_Points' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Sampling_Points" USING ("sampling_map_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Sampling_Maps")) WITH CHECK ("sampling_map_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Sampling_Maps"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Task_Assignees" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Task_Assignees' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Task_Assignees" USING ("task_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Tasks")) WITH CHECK ("task_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Tasks"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Task_Templates" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Task_Templates' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Task_Templates" USING ("test_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Tests") OR "drone_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Drones")) WITH CHECK ("test_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Tests") OR "drone_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Drones"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Task_Upload_Links" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Task_Upload_Links' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Task_Upload_Links" USING ("task_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Tasks")) WITH CHECK ("task_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Tasks"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Treatment_Field_Definitions" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Treatment_Field_Definitions' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Treatment_Field_Definitions" USING ("treatment_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Treatments")) WITH CHECK ("treatment_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Treatments"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Treatment_Protocol" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Treatment_Protocol' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Treatment_Protocol" USING ("project_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Projects")) WITH CHECK ("project_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Projects"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Upload_Metric_Values" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Upload_Metric_Values' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Upload_Metric_Values" USING ("metric_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Category_Metrics")) WITH CHECK ("metric_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Category_Metrics"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."WhatsApp_Contact_Cards" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'WhatsApp_Contact_Cards' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."WhatsApp_Contact_Cards" USING ("contact_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Contacts")) WITH CHECK ("contact_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Contacts"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."_nc_m2m_Fields_Crops" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = '_nc_m2m_Fields_Crops' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."_nc_m2m_Fields_Crops" USING ("Fields_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Fields")) WITH CHECK ("Fields_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Fields"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."_nc_m2m_Fields_Drones" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = '_nc_m2m_Fields_Drones' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."_nc_m2m_Fields_Drones" USING ("Fields_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Fields")) WITH CHECK ("Fields_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Fields"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."_nc_m2m_Fields_Tests" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = '_nc_m2m_Fields_Tests' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."_nc_m2m_Fields_Tests" USING ("Fields_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Fields")) WITH CHECK ("Fields_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Fields"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."_nc_m2m_Fields_Treatments" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = '_nc_m2m_Fields_Treatments' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."_nc_m2m_Fields_Treatments" USING ("Fields_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Fields")) WITH CHECK ("Fields_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Fields"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."_nc_m2m_Projects_Farms" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = '_nc_m2m_Projects_Farms' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."_nc_m2m_Projects_Farms" USING ("Projects_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Projects")) WITH CHECK ("Projects_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Projects"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."_nc_m2m_Projects_Lab Members" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = '_nc_m2m_Projects_Lab Members' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."_nc_m2m_Projects_Lab Members" USING ("Projects_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Projects")) WITH CHECK ("Projects_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Projects"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."_nc_m2m_Tests_Drones" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = '_nc_m2m_Tests_Drones' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."_nc_m2m_Tests_Drones" USING ("Tests_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Tests")) WITH CHECK ("Tests_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Tests"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."_nc_m2m_Tests_Tables" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = '_nc_m2m_Tests_Tables' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."_nc_m2m_Tests_Tables" USING ("Tables_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Tables")) WITH CHECK ("Tables_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Tables"))$sql$;
  END IF;

END $$;
