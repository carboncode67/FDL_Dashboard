-- OFE Dashboard -> FDB one-way sync of farmer management events (planting,
-- tillage, spraying, harvest...). Plan: docs/context-update-and-farm-timeline-plan.md §6.
-- Same precedent as 091 (forms / sampling maps): OFE owns each row, pushes a
-- whole snapshot keyed by ofe_id, and the row is read-only here. Column names
-- follow OFE's own tables so a later OFE/FDB consolidation is a straight copy;
-- ofe_id is nullable so FDB can author events itself one day.
--
-- Operation_Categories / Operation_Types: OFE's global operation catalog,
-- mirrored per lab (root-table lab_id pattern from 087). Management_Events and
-- its two link tables are farm_id children (089's subquery policy via Farms).
--
-- implement / product / crop_variety are small JSONB snapshots for now; they
-- become FKs once OFE's inventory is mirrored (plan §7).
--
-- Safe to re-run: IF NOT EXISTS throughout, policy/constraint creation guarded.

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Operation_Categories" (
  id         SERIAL PRIMARY KEY,
  lab_id     INT NOT NULL DEFAULT current_setting('app.current_lab_id', true)::int
             CONSTRAINT fk_operation_categories_lab_id REFERENCES public.labs(id),
  ofe_id     INT,
  name       TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_operation_categories_lab_ofe ON "pgntarg2udzj1f3"."Operation_Categories"(lab_id, ofe_id);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Operation_Types" (
  id                       SERIAL PRIMARY KEY,
  lab_id                   INT NOT NULL DEFAULT current_setting('app.current_lab_id', true)::int
                           CONSTRAINT fk_operation_types_lab_id REFERENCES public.labs(id),
  ofe_id                   INT,
  category_id              INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Operation_Categories"(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,
  requires_implement       BOOLEAN NOT NULL DEFAULT true,
  requires_seed_or_product BOOLEAN NOT NULL DEFAULT true,
  sort_order               INT NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_operation_types_lab_ofe ON "pgntarg2udzj1f3"."Operation_Types"(lab_id, ofe_id);
CREATE INDEX IF NOT EXISTS idx_operation_types_category ON "pgntarg2udzj1f3"."Operation_Types"(category_id);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Management_Events" (
  id                         SERIAL PRIMARY KEY,
  ofe_id                     INT UNIQUE,
  farm_id                    INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Farms"(id) ON DELETE CASCADE,
  operation_type_id          INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Operation_Types"(id),
  event_date                 DATE NOT NULL,
  experiment_id              INT REFERENCES "pgntarg2udzj1f3"."Farm_Experiments"(id) ON DELETE SET NULL,
  notes                      TEXT,
  source                     TEXT NOT NULL DEFAULT 'farmer_web', -- farmer_web | lab_member_web | api_sync
  implement                  JSONB, -- {ofe_id, name, type}
  product                    JSONB, -- {ofe_id, brand_name, type, extra_fields}
  crop_variety               JSONB, -- {ofe_id, name, crop}
  created_by_email           TEXT,
  created_by_name            TEXT,
  entered_on_behalf_of_email TEXT,
  ofe_created_at             TIMESTAMPTZ,
  ofe_updated_at             TIMESTAMPTZ,
  snapshot_hash              TEXT, -- OFE's hash of the last snapshot applied, so it can skip unchanged pushes
  synced_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_management_events_farm_date ON "pgntarg2udzj1f3"."Management_Events"(farm_id, event_date);
CREATE INDEX IF NOT EXISTS idx_management_events_experiment ON "pgntarg2udzj1f3"."Management_Events"(experiment_id);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Management_Event_Fields" (
  event_id INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Management_Events"(id) ON DELETE CASCADE,
  field_id INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Fields"(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, field_id)
);
CREATE INDEX IF NOT EXISTS idx_management_event_fields_field ON "pgntarg2udzj1f3"."Management_Event_Fields"(field_id);

-- Points at FDB's own upload rows (same (table, id) pair shape as
-- Task_Upload_Links); OFE's attachments are already mirrors of these.
CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Management_Event_Uploads" (
  event_id     INT  NOT NULL REFERENCES "pgntarg2udzj1f3"."Management_Events"(id) ON DELETE CASCADE,
  upload_table TEXT NOT NULL, -- photos | notes | recordings | locations | videos | lab-member-uploads
  upload_id    INT  NOT NULL,
  PRIMARY KEY (event_id, upload_table, upload_id)
);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['Operation_Categories', 'Operation_Types']
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

  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Management_Events" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Management_Events' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Management_Events" USING ("farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms")) WITH CHECK ("farm_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms"))$sql$;
  END IF;

  FOREACH t IN ARRAY ARRAY['Management_Event_Fields', 'Management_Event_Uploads']
  LOOP
    EXECUTE format('ALTER TABLE "pgntarg2udzj1f3".%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = t AND policyname = 'tenant_isolation'
    ) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3".%I ' ||
        'USING (event_id IN (SELECT id FROM "pgntarg2udzj1f3"."Management_Events")) ' ||
        'WITH CHECK (event_id IN (SELECT id FROM "pgntarg2udzj1f3"."Management_Events"))',
        t
      );
    END IF;
  END LOOP;
END $$;

-- Existing app_<slug> roles pick these tables up via ALTER DEFAULT PRIVILEGES in
-- create_lab_role.sql.template as long as this file is run as nocodb.
