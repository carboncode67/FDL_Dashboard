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
  )
UNION ALL
SELECT
  'geofence_type (078)',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pgntarg2udzj1f3' AND table_name = 'Geofences' AND column_name = 'geofence_type'
  )
UNION ALL
SELECT
  'geofence zone time sessions (079)',
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pgntarg2udzj1f3' AND table_name = 'Geofence_Zone_Time_Sessions'
  )
UNION ALL
SELECT
  'equipment loan renter_user_id (080)',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pgntarg2udzj1f3' AND table_name = 'Equipment_Loans' AND column_name = 'renter_user_id'
  )
UNION ALL
SELECT
  'form field show_when_label (081)',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pgntarg2udzj1f3' AND table_name = 'Form_Field_Definitions' AND column_name = 'show_when_label'
  )
UNION ALL
SELECT
  'sampling map assignment contact_id (082)',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pgntarg2udzj1f3' AND table_name = 'Sampling_Map_Assignments' AND column_name = 'contact_id'
  )
UNION ALL
SELECT
  'geofence time session field_id (083)',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pgntarg2udzj1f3' AND table_name = 'Geofence_Zone_Time_Sessions' AND column_name = 'field_id'
  )
UNION ALL
SELECT
  'sampling map naip_bbox (084)',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pgntarg2udzj1f3' AND table_name = 'Sampling_Maps' AND column_name = 'naip_bbox'
  )
UNION ALL
SELECT
  'sampling map naip_package_status (085)',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pgntarg2udzj1f3' AND table_name = 'Sampling_Maps' AND column_name = 'naip_package_status'
  )
UNION ALL
SELECT
  'form multiselect field type (086)',
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Form_Field_Definitions_field_type_check'
      AND pg_get_constraintdef(oid) LIKE '%multiselect%'
  )
UNION ALL
SELECT
  'farm tags + user tag filters (087)',
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pgntarg2udzj1f3' AND table_name = 'User_Farm_Tag_Filters'
  )
UNION ALL
SELECT
  'form / sampling map groups (087)',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pgntarg2udzj1f3' AND table_name = 'Sampling_Maps' AND column_name = 'group_id'
  )
UNION ALL
SELECT
  'form field stable keys (088)',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pgntarg2udzj1f3' AND table_name = 'Form_Responses' AND column_name = 'older_form_version'
  )
UNION ALL
SELECT
  'farm layers + basemap display name/CRS override (089)',
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pgntarg2udzj1f3' AND table_name = 'Farm_Layers'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pgntarg2udzj1f3' AND table_name = 'Basemaps' AND column_name = 'crs_override_epsg'
  )
UNION ALL
SELECT
  'yield runs (090)',
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pgntarg2udzj1f3' AND table_name = 'Yield_Runs'
  );
