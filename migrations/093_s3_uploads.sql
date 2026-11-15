-- Direct-to-storage basemap uploads via Garage (S3-compatible) presigned
-- multipart uploads — see docs/garage-s3-upload-plan.md. The browser PUTs
-- parts straight to the bucket; the Dashboard only signs part URLs and
-- finishes the upload, so a multi-GB GeoTIFF never passes through Next.js.
--
-- S3_Uploads: one row per multipart upload, from initiation until it is
-- completed (-> a Basemaps row) or aborted. It binds the presigned object key
-- to a farm and an uploader, so sign/complete calls can be authorised. Status:
--   uploading  parts being sent
--   completing CompleteMultipartUpload in progress (guards a double complete)
--   completed  object assembled, basemap_id set
--   aborted    cancelled by the uploader, or swept after 48 h (scheduler.ts)
--
-- Basemaps gains source_storage ('local' = DATA_DIR/basemap-sources/, as
-- before; 's3' = source_s3_key in S3_BUCKET). sha256 becomes nullable: no
-- server reads an S3 upload's bytes, so PipelineProcessor hashes the file as
-- it downloads it and returns source_sha256 in the tiling webhook.
--
-- Farm_id child table: 075's subquery RLS policy against Farms, same as 089/090.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."S3_Uploads" (
  id                SERIAL PRIMARY KEY,
  farm_id           INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Farms"(id) ON DELETE CASCADE,
  uploaded_by_id    TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  kind              TEXT NOT NULL DEFAULT 'basemap' CHECK (kind IN ('basemap')),
  s3_key            TEXT NOT NULL UNIQUE,
  upload_id         TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  bytes             BIGINT NOT NULL,
  part_size         BIGINT NOT NULL,
  part_count        INT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'completing', 'completed', 'aborted')),
  form_fields       JSONB NOT NULL DEFAULT '{}'::jsonb,
  basemap_id        INT REFERENCES "pgntarg2udzj1f3"."Basemaps"(id) ON DELETE SET NULL,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_s3_uploads_farm ON "pgntarg2udzj1f3"."S3_Uploads"(farm_id);
CREATE INDEX IF NOT EXISTS idx_s3_uploads_status ON "pgntarg2udzj1f3"."S3_Uploads"(status);

DO $$
BEGIN
  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."S3_Uploads" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'S3_Uploads' AND policyname = 'tenant_isolation'
  ) THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."S3_Uploads" USING ("farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms")) WITH CHECK ("farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms"))$sql$;
  END IF;
END $$;

ALTER TABLE "pgntarg2udzj1f3"."Basemaps" ADD COLUMN IF NOT EXISTS source_storage TEXT NOT NULL DEFAULT 'local';
ALTER TABLE "pgntarg2udzj1f3"."Basemaps" ADD COLUMN IF NOT EXISTS source_s3_key TEXT;
ALTER TABLE "pgntarg2udzj1f3"."Basemaps" ALTER COLUMN sha256 DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'basemaps_source_storage_check'
  ) THEN
    ALTER TABLE "pgntarg2udzj1f3"."Basemaps"
      ADD CONSTRAINT basemaps_source_storage_check
      CHECK (source_storage IN ('local', 's3') AND (source_storage <> 's3' OR source_s3_key IS NOT NULL));
  END IF;
END $$;

-- Existing app_<slug> roles pick S3_Uploads up via ALTER DEFAULT PRIVILEGES in
-- create_lab_role.sql.template as long as this file is run as nocodb.
