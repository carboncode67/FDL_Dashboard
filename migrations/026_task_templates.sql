-- Task templates attached to Tests or Drones; auto-created as Tasks when assigned to an experiment

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Task_Templates" (
  id             SERIAL PRIMARY KEY,
  description    TEXT NOT NULL,
  classification TEXT,
  priority       TEXT NOT NULL DEFAULT 'medium',
  test_id        INT  REFERENCES "pgntarg2udzj1f3"."Tests"(id)  ON DELETE CASCADE,
  drone_id       INT  REFERENCES "pgntarg2udzj1f3"."Drones"(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
