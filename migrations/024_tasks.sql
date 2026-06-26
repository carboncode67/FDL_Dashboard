-- Lab workflow tasks linked to experiments, with assignees and upload linkage

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Tasks" (
  id            SERIAL PRIMARY KEY,
  experiment_id INT REFERENCES "pgntarg2udzj1f3"."Farm_Experiments"(id) ON DELETE SET NULL,
  description   TEXT NOT NULL,
  classification TEXT,
  status        TEXT NOT NULL DEFAULT 'not started',
  priority      TEXT NOT NULL DEFAULT 'medium',
  due_date      DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Task_Assignees" (
  task_id INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Tasks"(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);

-- Links tasks to any upload record (photos, notes, recordings, etc.)
CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Task_Upload_Links" (
  task_id      INT  NOT NULL REFERENCES "pgntarg2udzj1f3"."Tasks"(id) ON DELETE CASCADE,
  upload_id    INT  NOT NULL,
  upload_table TEXT NOT NULL,
  PRIMARY KEY (task_id, upload_id, upload_table)
);
