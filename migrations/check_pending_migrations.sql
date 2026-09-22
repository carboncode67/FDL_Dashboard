-- Read-only diagnostic: checks whether the most recent migrations' artifacts
-- are present. Not a migration itself, not run automatically by anything —
-- delete after use if you don't want it cluttering the migrations/ folder.

SELECT
  'nocodb GUC (076)' AS check,
  EXISTS (
    SELECT 1 FROM pg_roles, LATERAL unnest(rolconfig) AS cfg
    WHERE rolname = 'nocodb' AND cfg = 'app.current_lab_id=1'
  ) AS applied
UNION ALL
SELECT
  'password_reset columns (077)',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
      AND column_name = 'password_reset_token_hash'
  )
UNION ALL
SELECT
  'public.users RLS (072)',
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'tenant_isolation'
  )
UNION ALL
SELECT
  'basemaps_rls (075)',
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'Basemaps' AND policyname = 'tenant_isolation'
  )
UNION ALL
SELECT
  'basemaps table (074)',
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'Basemaps'
  )
UNION ALL
SELECT
  'labs table + lab_id (067)',
  EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'labs' AND table_schema = 'public'
  );
