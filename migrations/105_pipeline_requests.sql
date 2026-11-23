-- Pipeline requests (docs/pipeline-requests-plan.md, phase 1).
--
-- Anyone with a login describes a workflow: its inputs, outputs, settings and
-- what it should do. The Dashboard turns that into a skeleton pipeline.yaml
-- for the developer to download and implement. Nothing here is ever run; the
-- requests also serve as the lab's log of what people are asking for.
--
-- Pipeline_Requests.status: requested → accepted → in_development → testing
--   → live → retired, or declined. Only admins move it past "requested"; the
--   requester may edit it while it is "requested".
-- inputs / outputs / params / sample_data: JSONB, the YAML's sections
--   (validated in lib/pipeline-requests.ts).
-- pipeline_key: "<id zero-padded>-<slug>", fixed when the request is created
--   so the skeleton file name never changes.
-- Pipeline_Request_Attachments: small files for the developer to read
--   (DATA_DIR/pipeline-requests/<request id>/<stored_name>). Never executed.
--
-- Root-table conventions as 092/097/101/102: lab_id NOT NULL with the GUC
-- default, FK to labs, ENABLE (not FORCE) RLS tenant_isolation. Safe to re-run.

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Pipeline_Requests" (
  id               SERIAL PRIMARY KEY,
  lab_id           INT NOT NULL DEFAULT current_setting('app.current_lab_id', true)::int
                   CONSTRAINT fk_pipeline_requests_lab_id REFERENCES public.labs(id),
  pipeline_key     TEXT NOT NULL,
  name             TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  inputs           JSONB NOT NULL DEFAULT '[]'::jsonb,
  outputs          JSONB NOT NULL DEFAULT '[]'::jsonb,
  params           JSONB NOT NULL DEFAULT '[]'::jsonb,
  sample_data      JSONB NOT NULL DEFAULT '[]'::jsonb,
  status           TEXT NOT NULL DEFAULT 'requested'
                   CHECK (status IN ('requested', 'accepted', 'declined', 'in_development', 'testing', 'live', 'retired')),
  admin_note       TEXT,
  live_version     INT,
  requested_by_id  TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  status_by_id     TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  status_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pipeline_requests_key
  ON "pgntarg2udzj1f3"."Pipeline_Requests"(lab_id, pipeline_key);
CREATE INDEX IF NOT EXISTS idx_pipeline_requests_status
  ON "pgntarg2udzj1f3"."Pipeline_Requests"(lab_id, status);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Pipeline_Request_Attachments" (
  id             SERIAL PRIMARY KEY,
  lab_id         INT NOT NULL DEFAULT current_setting('app.current_lab_id', true)::int
                 CONSTRAINT fk_pipeline_request_attachments_lab_id REFERENCES public.labs(id),
  request_id     INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Pipeline_Requests"(id) ON DELETE CASCADE,
  original_name  TEXT NOT NULL,
  stored_name    TEXT NOT NULL,
  bytes          BIGINT NOT NULL,
  uploaded_by_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pipeline_request_attachments_request
  ON "pgntarg2udzj1f3"."Pipeline_Request_Attachments"(request_id);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['Pipeline_Requests', 'Pipeline_Request_Attachments']
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
END $$;
