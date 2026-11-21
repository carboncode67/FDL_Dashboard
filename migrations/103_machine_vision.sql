-- Machine vision (GitHub issue #4, docs/machine-vision-plan.md): DINOv3 patch
-- embeddings + a light head (kNN / logistic regression) on PipelineProcessor.
--
-- Vision_Jobs        one per workflow Task (task_id unique)
-- Vision_Classes     the job's classes; exactly one is_background row
-- Vision_Sources     what the job runs over: a photo upload or a Basemap
-- Vision_Labels      every training signal (point / box / polygon). geom is
--                    GeoJSON in pixel coords of the (EXIF-rotated) photo, or
--                    lon/lat for a basemap; the pixel<->CRS mapping lives on
--                    the processor only
-- Vision_Runs        one train+predict job on the processor
-- Vision_Predictions a run's detections, with a review state (phase 3)
--
-- RLS: Vision_Jobs is a child of Tasks (subquery policy, like 090/100); the
-- rest are children of Vision_Jobs. Safe to re-run.

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Vision_Jobs" (
  id             SERIAL PRIMARY KEY,
  task_id        INT NOT NULL UNIQUE REFERENCES "pgntarg2udzj1f3"."Tasks"(id) ON DELETE CASCADE,
  mode           TEXT NOT NULL DEFAULT 'detection' CHECK (mode IN ('detection', 'segmentation')),
  status         TEXT NOT NULL DEFAULT 'labeling' CHECK (status IN ('labeling', 'running', 'review', 'done')),
  settings       JSONB NOT NULL DEFAULT '{}'::jsonb,   -- head, k, threshold, gsd_m, model…
  created_by_id  TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Vision_Classes" (
  id             SERIAL PRIMARY KEY,
  job_id         INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Vision_Jobs"(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  color          TEXT NOT NULL DEFAULT '#e11d48',
  is_background  BOOLEAN NOT NULL DEFAULT false,
  sort_order     INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_vision_classes_job ON "pgntarg2udzj1f3"."Vision_Classes"(job_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vision_classes_name ON "pgntarg2udzj1f3"."Vision_Classes"(job_id, lower(name));

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Vision_Sources" (
  id             SERIAL PRIMARY KEY,
  job_id         INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Vision_Jobs"(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('photo', 'basemap')),
  upload_id      INT,
  upload_table   TEXT,
  basemap_id     INT REFERENCES "pgntarg2udzj1f3"."Basemaps"(id) ON DELETE CASCADE,
  meta           JSONB,               -- processor's reply: size, grid, gsd_m, model
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((kind = 'photo' AND upload_id IS NOT NULL AND upload_table IS NOT NULL AND basemap_id IS NULL)
      OR (kind = 'basemap' AND basemap_id IS NOT NULL AND upload_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_vision_sources_job ON "pgntarg2udzj1f3"."Vision_Sources"(job_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vision_sources_photo ON "pgntarg2udzj1f3"."Vision_Sources"(job_id, upload_table, upload_id) WHERE kind = 'photo';
CREATE UNIQUE INDEX IF NOT EXISTS uq_vision_sources_basemap ON "pgntarg2udzj1f3"."Vision_Sources"(job_id, basemap_id) WHERE kind = 'basemap';

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Vision_Labels" (
  id             SERIAL PRIMARY KEY,
  job_id         INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Vision_Jobs"(id) ON DELETE CASCADE,
  source_id      INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Vision_Sources"(id) ON DELETE CASCADE,
  class_id       INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Vision_Classes"(id) ON DELETE CASCADE,
  geom_kind      TEXT NOT NULL CHECK (geom_kind IN ('point', 'box', 'polygon')),
  geom           JSONB NOT NULL,
  origin         TEXT NOT NULL DEFAULT 'manual'
                 CHECK (origin IN ('manual', 'gps_import', 'prediction_confirmed', 'prediction_rejected', 'cvat')),
  prediction_id  INT,                 -- set for prediction_confirmed / _rejected
  created_by_id  TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vision_labels_job ON "pgntarg2udzj1f3"."Vision_Labels"(job_id);
CREATE INDEX IF NOT EXISTS idx_vision_labels_source ON "pgntarg2udzj1f3"."Vision_Labels"(source_id);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Vision_Runs" (
  id               SERIAL PRIMARY KEY,
  job_id           INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Vision_Jobs"(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'ready', 'failed')),
  params           JSONB NOT NULL DEFAULT '{}'::jsonb,   -- head, k, threshold, gsd_m, model
  label_count      INT NOT NULL DEFAULT 0,
  metrics          JSONB,
  prediction_count INT,
  layer_id         INT REFERENCES "pgntarg2udzj1f3"."Farm_Layers"(id) ON DELETE SET NULL,
  error_message    TEXT,
  created_by_id    TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  started_at       TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vision_runs_job ON "pgntarg2udzj1f3"."Vision_Runs"(job_id);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Vision_Predictions" (
  id             SERIAL PRIMARY KEY,
  run_id         INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Vision_Runs"(id) ON DELETE CASCADE,
  source_id      INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Vision_Sources"(id) ON DELETE CASCADE,
  class_id       INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Vision_Classes"(id) ON DELETE CASCADE,
  score          REAL NOT NULL,
  patches        INT,
  centroid       JSONB NOT NULL,      -- [x, y]: pixels (photo) or [lon, lat] (basemap)
  bbox           JSONB NOT NULL,      -- [minx, miny, maxx, maxy], same space
  polygon        JSONB,               -- GeoJSON geometry, same space
  review         TEXT NOT NULL DEFAULT 'unreviewed' CHECK (review IN ('unreviewed', 'correct', 'incorrect')),
  reviewed_by_id TEXT REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_vision_predictions_run ON "pgntarg2udzj1f3"."Vision_Predictions"(run_id, score DESC);

DO $$
DECLARE t TEXT;
BEGIN
  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Vision_Jobs" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Vision_Jobs' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Vision_Jobs" USING ("task_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Tasks")) WITH CHECK ("task_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Tasks"))$sql$;
  END IF;
  FOREACH t IN ARRAY ARRAY['Vision_Classes', 'Vision_Sources', 'Vision_Labels', 'Vision_Runs'] LOOP
    EXECUTE format('ALTER TABLE "pgntarg2udzj1f3".%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = t AND policyname = 'tenant_isolation') THEN
      EXECUTE format('CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3".%I USING ("job_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Vision_Jobs")) WITH CHECK ("job_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Vision_Jobs"))', t);
    END IF;
  END LOOP;
  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Vision_Predictions" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Vision_Predictions' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Vision_Predictions" USING ("run_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Vision_Runs")) WITH CHECK ("run_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Vision_Runs"))$sql$;
  END IF;
END $$;

-- Existing app_<slug> roles pick these tables up via ALTER DEFAULT PRIVILEGES in
-- create_lab_role.sql.template as long as this file is run as nocodb.
