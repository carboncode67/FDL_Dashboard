-- Closes a gap in migration 074_basemaps.sql: "Basemaps" landed in
-- pgntarg2udzj1f3 (the RLS-protected schema) after migrations 070/071 already
-- ran, so it never got a tenant_isolation policy the way every table that
-- existed at the time did -- and per sql/roles/create_lab_role.sql.template's
-- ALTER DEFAULT PRIVILEGES for that schema, every app_<slug> role already has
-- full CRUD on it regardless. Under TENANT_ENFORCEMENT=hard that's a live
-- cross-lab leak on uploaded basemap metadata (filenames, footprint, tiling
-- status) the same shape as the public.users gap migration 072 closed.
--
-- Same child-table pattern as every farm_id-scoped table in 071 (e.g.
-- Farm_Experiments): scope via a subquery against Farms, which is itself
-- already under its own root tenant_isolation policy from 070 -- Postgres
-- composes the chain correctly without this table needing its own lab_id.
--
-- Safe to re-run: ENABLE ROW LEVEL SECURITY and CREATE POLICY are guarded by
-- existence checks below, same convention as 070-072.

DO $$
BEGIN
  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Basemaps" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Basemaps' AND policyname = 'tenant_isolation'
  ) THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Basemaps" USING ("farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms")) WITH CHECK ("farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms"))$sql$;
  END IF;
END $$;
