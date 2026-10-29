-- Unified farm upload box (farm page Overview tab): one drop zone replaces the
-- separate Field Boundaries / Basemap / Document cards. A spatial file the
-- uploader chooses to display goes to one of three places:
--   * GeoTIFF          -> Basemaps (existing tiling flow), now with an optional
--                         display name and uploader-specified source CRS
--   * vector, "fields" -> Fields (existing boundaries flow)
--   * vector/CSV, "layer" -> Farm_Layers (new): a named display-only overlay,
--                         stored as a GeoJSON FeatureCollection already
--                         reprojected to EPSG:4326 (same convention as
--                         Fields.geometry)
-- and, either way, the original file is also kept as a farm Document
-- (document_id links the two so deleting the layer doesn't orphan the
-- provenance, and deleting the document just unlinks).
--
-- Farm_Layers is a farm_id child table, so it takes 075's subquery RLS policy
-- against Farms (no lab_id of its own) rather than 087's root-table pattern.
--
-- Safe to re-run: IF NOT EXISTS throughout, policy creation guarded.

ALTER TABLE "pgntarg2udzj1f3"."Basemaps" ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE "pgntarg2udzj1f3"."Basemaps" ADD COLUMN IF NOT EXISTS crs_override_epsg INT;

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Farm_Layers" (
  id                SERIAL PRIMARY KEY,
  farm_id           INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Farms"(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  geometry_kind     TEXT NOT NULL CHECK (geometry_kind IN ('point', 'line', 'polygon', 'mixed')),
  feature_count     INT  NOT NULL,
  geojson           JSONB NOT NULL,
  original_filename TEXT NOT NULL,
  source_epsg       INT,
  document_id       INT REFERENCES "pgntarg2udzj1f3"."Documents"(id) ON DELETE SET NULL,
  uploaded_by_id    TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_farm_layers_farm ON "pgntarg2udzj1f3"."Farm_Layers"(farm_id);

DO $$
BEGIN
  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Farm_Layers" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Farm_Layers' AND policyname = 'tenant_isolation'
  ) THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Farm_Layers" USING ("farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms")) WITH CHECK ("farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms"))$sql$;
  END IF;
END $$;

-- Existing app_<slug> roles pick this table up via ALTER DEFAULT PRIVILEGES in
-- create_lab_role.sql.template as long as this file is run as nocodb.
