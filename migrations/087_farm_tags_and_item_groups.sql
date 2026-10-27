-- Farm tags + Form / Sampling Map groups (UI tidy-up).
--
-- 1. Farm tags: a lab-scoped tag vocabulary ("dairy", "grazing", "crops", ...)
--    many-to-many with Farms. Any signed-in user can create tags, tag farms and
--    filter by them.
-- 2. User_Farm_Tag_Filters: per-user include/exclude tag rules, resolved by
--    lib/get-user-filters.ts getEffectiveScope() into the farm list every page
--    already filters by — so hiding "dairy" applies site-wide. Lives in the
--    experiment schema (not public, unlike User_Farm_Filters) so it inherits
--    the app_<slug> roles' default privileges there; public grants are
--    deliberately narrow (see sql/roles/README.md).
-- 3. Form_Groups / Sampling_Map_Groups: separate, flat, lab-scoped group lists;
--    each Form / Sampling_Map belongs to at most one group (group_id NULL =
--    "Ungrouped"). Deleting a group ungroups its members (ON DELETE SET NULL).
--
-- New root tables follow 069/070: lab_id NOT NULL, DEFAULT = the connection's
-- app.current_lab_id GUC (nocodb has it since 076), FK to labs, RLS
-- tenant_isolation. Child tables get subquery policies like 071.
--
-- Safe to re-run: IF NOT EXISTS throughout, policy creation guarded.

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Farm_Tags" (
  id         SERIAL PRIMARY KEY,
  lab_id     INT NOT NULL DEFAULT current_setting('app.current_lab_id', true)::int
             CONSTRAINT fk_farm_tags_lab_id REFERENCES public.labs(id),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_farm_tags_lab_name ON "pgntarg2udzj1f3"."Farm_Tags"(lab_id, lower(name));

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Farm_Tag_Links" (
  farm_id INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Farms"(id) ON DELETE CASCADE,
  tag_id  INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Farm_Tags"(id) ON DELETE CASCADE,
  PRIMARY KEY (farm_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_farm_tag_links_tag ON "pgntarg2udzj1f3"."Farm_Tag_Links"(tag_id);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."User_Farm_Tag_Filters" (
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tag_id  INT  NOT NULL REFERENCES "pgntarg2udzj1f3"."Farm_Tags"(id) ON DELETE CASCADE,
  mode    TEXT NOT NULL CHECK (mode IN ('include', 'exclude')),
  PRIMARY KEY (user_id, tag_id)
);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Form_Groups" (
  id         SERIAL PRIMARY KEY,
  lab_id     INT NOT NULL DEFAULT current_setting('app.current_lab_id', true)::int
             CONSTRAINT fk_form_groups_lab_id REFERENCES public.labs(id),
  name       TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_form_groups_lab_name ON "pgntarg2udzj1f3"."Form_Groups"(lab_id, lower(name));

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Sampling_Map_Groups" (
  id         SERIAL PRIMARY KEY,
  lab_id     INT NOT NULL DEFAULT current_setting('app.current_lab_id', true)::int
             CONSTRAINT fk_sampling_map_groups_lab_id REFERENCES public.labs(id),
  name       TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sampling_map_groups_lab_name ON "pgntarg2udzj1f3"."Sampling_Map_Groups"(lab_id, lower(name));

ALTER TABLE "pgntarg2udzj1f3"."Forms" ADD COLUMN IF NOT EXISTS group_id INT;
ALTER TABLE "pgntarg2udzj1f3"."Sampling_Maps" ADD COLUMN IF NOT EXISTS group_id INT;
CREATE INDEX IF NOT EXISTS idx_forms_group ON "pgntarg2udzj1f3"."Forms"(group_id);
CREATE INDEX IF NOT EXISTS idx_sampling_maps_group ON "pgntarg2udzj1f3"."Sampling_Maps"(group_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_forms_group_id') THEN
    ALTER TABLE "pgntarg2udzj1f3"."Forms" ADD CONSTRAINT fk_forms_group_id
      FOREIGN KEY (group_id) REFERENCES "pgntarg2udzj1f3"."Form_Groups"(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sampling_maps_group_id') THEN
    ALTER TABLE "pgntarg2udzj1f3"."Sampling_Maps" ADD CONSTRAINT fk_sampling_maps_group_id
      FOREIGN KEY (group_id) REFERENCES "pgntarg2udzj1f3"."Sampling_Map_Groups"(id) ON DELETE SET NULL;
  END IF;
END $$;

-- RLS — same ENABLE (not FORCE) convention as 070/071.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['Farm_Tags', 'Form_Groups', 'Sampling_Map_Groups']
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

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Farm_Tag_Links" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Farm_Tag_Links' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Farm_Tag_Links" USING ("farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms") AND "tag_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farm_Tags")) WITH CHECK ("farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms") AND "tag_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farm_Tags"))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."User_Farm_Tag_Filters" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'User_Farm_Tag_Filters' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."User_Farm_Tag_Filters" USING ("user_id" IN (SELECT id FROM public.users) AND "tag_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farm_Tags")) WITH CHECK ("user_id" IN (SELECT id FROM public.users) AND "tag_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farm_Tags"))$sql$;
  END IF;
END $$;

-- Existing app_<slug> roles were provisioned before these tables existed; ALTER DEFAULT
-- PRIVILEGES in create_lab_role.sql.template covers tables created by nocodb afterwards,
-- so nothing to grant here as long as this file is run as nocodb.
