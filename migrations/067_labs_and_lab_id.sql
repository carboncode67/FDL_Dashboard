-- Planned Changes item 10 (+13): Lab-level data silo, Phase 1 of
-- docs/lab-data-silo-plan.md — "additive, nullable, backfilled, NO enforcement"
-- by design. This migration alone changes zero application behaviour: it adds a
-- populated column nothing reads yet. NOT NULL / FK / RLS come in later,
-- separate migrations (068+) only after this one has soaked.
--
-- Safe to re-run (IF NOT EXISTS throughout). Rollback: DROP the lab_id columns
-- (unused) and DROP TABLE public.labs.

CREATE TABLE IF NOT EXISTS public.labs (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  db_role    TEXT,                              -- e.g. 'app_fdl'; set once the role is provisioned (Phase 3)
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The one lab that exists today. Fixed id=1 so every backfill below can hardcode it.
INSERT INTO public.labs (id, name, slug, db_role)
VALUES (1, 'Farmers Datalab', 'fdl', 'app_fdl')
ON CONFLICT (id) DO NOTHING;
-- Keep the sequence ahead of the hand-picked id so the next INSERT ... DEFAULT doesn't collide.
SELECT setval(pg_get_serial_sequence('public.labs', 'id'), (SELECT MAX(id) FROM public.labs));

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS lab_id INT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS platform_admin BOOLEAN NOT NULL DEFAULT false;
UPDATE public.users SET lab_id = 1 WHERE lab_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_lab ON public.users(lab_id);

-- Owned/root tables (§4 "Owned data" in the plan doc) — lab_id becomes NOT NULL
-- in migration 068, once this backfill has been verified with no nulls.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Projects', 'Farms', 'Contacts', 'Tasks', 'Forms', 'Geofences', 'Pipelines',
    'Sampling_Maps', 'MessageTemplates', 'Reporting_Subscriptions',
    'Upload_Categories', 'Tables', 'Equipment_Loans',
    'Photos', 'Notes', 'Recordings', 'Locations', 'Videos',
    'Lab_Member_Uploads', 'Documents'
  ]
  LOOP
    EXECUTE format('ALTER TABLE "pgntarg2udzj1f3".%I ADD COLUMN IF NOT EXISTS lab_id INT', t);
    EXECUTE format('UPDATE "pgntarg2udzj1f3".%I SET lab_id = 1 WHERE lab_id IS NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON "pgntarg2udzj1f3".%I(lab_id)',
                    'idx_' || lower(t) || '_lab', t);
  END LOOP;
END $$;

-- Shared library tables (§4 "Shared library data") — lab_id stays nullable
-- forever; NULL means "visible to every lab" once RLS lands. Backfilled to 1
-- now (not NULL) because today there's exactly one lab and everything in the
-- lab's existing library belongs to it, not to some future global catalog.
-- Promoting a record to global (lab_id = NULL) is a deliberate platform-admin
-- action added in Phase 5, not something this migration should do implicitly.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['Tests', 'Treatments', 'Methodologies', 'Drones', 'Crops']
  LOOP
    EXECUTE format('ALTER TABLE "pgntarg2udzj1f3".%I ADD COLUMN IF NOT EXISTS lab_id INT', t);
    EXECUTE format('UPDATE "pgntarg2udzj1f3".%I SET lab_id = 1 WHERE lab_id IS NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON "pgntarg2udzj1f3".%I(lab_id)',
                    'idx_' || lower(t) || '_lab', t);
  END LOOP;
END $$;
