-- CVAT annotation tasks and per-image annotation results

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Cvat_Tasks" (
  id              SERIAL PRIMARY KEY,
  project_id      INT REFERENCES "pgntarg2udzj1f3"."Projects"(id) ON DELETE CASCADE,
  cvat_task_id    INT,
  cvat_project_id INT,
  name            TEXT NOT NULL,
  label_set       JSONB NOT NULL DEFAULT '[]',
  status          TEXT NOT NULL DEFAULT 'pending',
  image_count     INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Annotations" (
  id           SERIAL PRIMARY KEY,
  upload_id    INT NOT NULL,
  upload_table TEXT NOT NULL,
  filename     TEXT,
  cvat_task_id INT REFERENCES "pgntarg2udzj1f3"."Cvat_Tasks"(id) ON DELETE SET NULL,
  shapes       JSONB NOT NULL DEFAULT '[]',
  label_set    TEXT[] NOT NULL DEFAULT '{}',
  annotated_by TEXT,
  source       TEXT NOT NULL DEFAULT 'cvat',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS annotations_upload_idx
  ON "pgntarg2udzj1f3"."Annotations"(upload_id, upload_table);
