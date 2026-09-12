-- Phase 3 of docs/lab-data-silo-plan.md. Follows migration 069 (lab_id NOT
-- NULL + FK on owned tables, DEFAULT on all). This migration turns the
-- isolation on for the tenant-root tables — ENABLE (not FORCE) ROW LEVEL
-- SECURITY, so the table owner (nocodb, superuser, used for migrations and
-- the maintainer's own cross-lab development) keeps bypassing by design; only
-- a non-owner, non-superuser role (app_<slug> — sql/roles/) is actually
-- subject to these policies. Child tables (no own lab_id column) get their
-- own subquery-based policies in a later migration, batched separately.
--
-- Safe to re-run: ENABLE ROW LEVEL SECURITY and CREATE POLICY are guarded by
-- existence checks below.

DO $$
DECLARE
  t TEXT;
BEGIN
  -- Owned/root tables: lab_id = current lab only (NOT NULL, so no OR NULL branch needed).
  FOREACH t IN ARRAY ARRAY[
    'Projects', 'Farms', 'Contacts', 'Tasks', 'Forms', 'Geofences', 'Pipelines',
    'Sampling_Maps', 'MessageTemplates', 'Reporting_Subscriptions',
    'Upload_Categories', 'Tables', 'Equipment_Loans',
    'Photos', 'Notes', 'Recordings', 'Locations', 'Videos',
    'Lab_Member_Uploads', 'Documents'
  ]
  LOOP
    EXECUTE format('ALTER TABLE "pgntarg2udzj1f3".%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = t AND policyname = 'tenant_isolation'
    ) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3".%I ' ||
        'USING (lab_id = current_setting(''app.current_lab_id'', true)::int) ' ||
        'WITH CHECK (lab_id = current_setting(''app.current_lab_id'', true)::int)',
        t
      );
    END IF;
  END LOOP;

  -- Shared library tables: current lab's own rows, OR the global (lab_id IS
  -- NULL) ones — readable by everyone, writable (including by the owning lab)
  -- only through the bypass role, per docs/lab-data-silo-plan.md §7 (a global
  -- record is deliberately read-only once promoted).
  FOREACH t IN ARRAY ARRAY['Tests', 'Treatments', 'Methodologies', 'Drones', 'Crops']
  LOOP
    EXECUTE format('ALTER TABLE "pgntarg2udzj1f3".%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = t AND policyname = 'tenant_isolation'
    ) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3".%I ' ||
        'USING (lab_id = current_setting(''app.current_lab_id'', true)::int OR lab_id IS NULL) ' ||
        'WITH CHECK (lab_id = current_setting(''app.current_lab_id'', true)::int)',
        t
      );
    END IF;
  END LOOP;
END $$;
