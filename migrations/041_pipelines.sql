-- Automated data-processing pipelines: sample dataset + script + optional model,
-- wired by an LLM on a separate processing machine, auto-triggered on matching uploads.
CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Pipelines" (
  id                            SERIAL PRIMARY KEY,
  name                          TEXT NOT NULL,
  description                   TEXT,
  status                        TEXT NOT NULL DEFAULT 'draft', -- draft | testing | live | failed | disabled
  match_table                   TEXT NOT NULL,
  match_category                TEXT,
  match_project_id              INT,
  match_test_id                 INT,
  sample_dataset_filename       TEXT NOT NULL,
  sample_dataset_original_name  TEXT NOT NULL,
  script_filename               TEXT NOT NULL,
  script_original_name          TEXT NOT NULL,
  model_filename                TEXT,
  model_original_name           TEXT,
  wired_command                 TEXT,
  wired_requirements             TEXT,
  llm_notes                     TEXT,
  external_pipeline_id          TEXT,
  last_run_at                   TIMESTAMPTZ,
  last_run_status               TEXT,
  created_by                    TEXT NOT NULL REFERENCES "public"."users"(id),
  created_at                    TIMESTAMPTZ DEFAULT now(),
  updated_at                    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipelines_status ON "pgntarg2udzj1f3"."Pipelines"(status);
CREATE INDEX IF NOT EXISTS idx_pipelines_match_table ON "pgntarg2udzj1f3"."Pipelines"(match_table);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Pipeline_Runs" (
  id                    SERIAL PRIMARY KEY,
  pipeline_id           INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Pipelines"(id) ON DELETE CASCADE,
  is_test_run           BOOLEAN NOT NULL DEFAULT false,
  trigger_upload_id     INT,
  trigger_upload_table  TEXT,
  status                TEXT NOT NULL DEFAULT 'queued', -- queued | running | success | failed
  external_job_id       TEXT,
  stdout_log            TEXT,
  stderr_log            TEXT,
  output_files          JSONB NOT NULL DEFAULT '[]',
  error_message         TEXT,
  started_at            TIMESTAMPTZ,
  finished_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_pipeline ON "pgntarg2udzj1f3"."Pipeline_Runs"(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON "pgntarg2udzj1f3"."Pipeline_Runs"(status);
