-- Phase 3 of docs/lab-data-silo-plan.md. Follows migration 067 (added the
-- nullable lab_id columns, backfilled). This migration:
--   1. Re-backfills any stray nulls (defensive — a row could have been
--      created by the app between 067 and now with no lab_id set, since
--      there was no column default yet; this closes that gap first).
--   2. Sets each lab_id column's DEFAULT to the connecting role's own lab
--      (current_setting('app.current_lab_id', true)::int — the `true` means
--      "return NULL instead of erroring" for connections with no such
--      setting, e.g. nocodb/migrations/scripts, which must keep setting
--      lab_id explicitly; see CLAUDE.md and docs/lab-data-silo-plan.md §8).
--      Once the app actually connects through a per-lab role (Phase 3's
--      later "provision app_<slug>" step), every app-created row gets the
--      right lab_id with no code change — see docs/lab-data-silo-plan.md §4
--      "Column default = the connection's lab".
--   3. Owned tables only: SET NOT NULL, then ADD the FK to labs(id).
--      Library tables (Tests/Treatments/Methodologies/Drones/Crops) get the
--      DEFAULT and a nullable FK, but NOT NULL — NULL is a meaningful state
--      there ("shared across every lab"), not a data-quality problem.
--
-- Safe to re-run: backfill/DEFAULT/NOT NULL are all idempotent; the FK
-- existence check avoids Postgres's lack of "ADD CONSTRAINT IF NOT EXISTS".

DO $$
DECLARE
  t TEXT;
BEGIN
  -- Owned/root tables (§4 "Owned data") — NOT NULL + FK.
  FOREACH t IN ARRAY ARRAY[
    'Projects', 'Farms', 'Contacts', 'Tasks', 'Forms', 'Geofences', 'Pipelines',
    'Sampling_Maps', 'MessageTemplates', 'Reporting_Subscriptions',
    'Upload_Categories', 'Tables', 'Equipment_Loans',
    'Photos', 'Notes', 'Recordings', 'Locations', 'Videos',
    'Lab_Member_Uploads', 'Documents'
  ]
  LOOP
    EXECUTE format('UPDATE "pgntarg2udzj1f3".%I SET lab_id = 1 WHERE lab_id IS NULL', t);
    EXECUTE format(
      'ALTER TABLE "pgntarg2udzj1f3".%I ALTER COLUMN lab_id SET DEFAULT current_setting(''app.current_lab_id'', true)::int',
      t
    );
    EXECUTE format('ALTER TABLE "pgntarg2udzj1f3".%I ALTER COLUMN lab_id SET NOT NULL', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'fk_' || lower(t) || '_lab_id'
    ) THEN
      EXECUTE format(
        'ALTER TABLE "pgntarg2udzj1f3".%I ADD CONSTRAINT %I FOREIGN KEY (lab_id) REFERENCES public.labs(id)',
        t, 'fk_' || lower(t) || '_lab_id'
      );
    END IF;
  END LOOP;

  -- Shared library tables (§4 "Shared library data") — DEFAULT only, stays
  -- nullable; new rows default to the creating lab, NULL is a deliberate
  -- later promotion to "global" (Phase 5), never done implicitly here.
  FOREACH t IN ARRAY ARRAY['Tests', 'Treatments', 'Methodologies', 'Drones', 'Crops']
  LOOP
    EXECUTE format(
      'ALTER TABLE "pgntarg2udzj1f3".%I ALTER COLUMN lab_id SET DEFAULT current_setting(''app.current_lab_id'', true)::int',
      t
    );
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'fk_' || lower(t) || '_lab_id'
    ) THEN
      EXECUTE format(
        'ALTER TABLE "pgntarg2udzj1f3".%I ADD CONSTRAINT %I FOREIGN KEY (lab_id) REFERENCES public.labs(id)',
        t, 'fk_' || lower(t) || '_lab_id'
      );
    END IF;
  END LOOP;
END $$;

-- public.users — same treatment as an owned table (every user belongs to
-- exactly one lab).
UPDATE public.users SET lab_id = 1 WHERE lab_id IS NULL;
ALTER TABLE public.users ALTER COLUMN lab_id SET DEFAULT current_setting('app.current_lab_id', true)::int;
ALTER TABLE public.users ALTER COLUMN lab_id SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_lab_id') THEN
    ALTER TABLE public.users ADD CONSTRAINT fk_users_lab_id FOREIGN KEY (lab_id) REFERENCES public.labs(id);
  END IF;
END $$;
