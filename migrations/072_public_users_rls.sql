-- Closes a gap left by migrations 069-071 (Phase 3 of docs/lab-data-silo-plan.md):
-- public.users got a NOT NULL lab_id + FK in 069, same as every owned table in
-- "pgntarg2udzj1f3", but 070/071 (which actually turn on RLS) only iterate that
-- other schema -- public.users and its three per-user filter tables never got
-- RLS. Under TENANT_ENFORCEMENT=hard, that meant any lab's app_<slug> role could
-- read/write every other lab's users (including bearer_token) and their
-- Dashboard-filter preferences with zero isolation. See
-- docs/dashboard-ui-security-review notes / the lab-data-silo-plan doc for the
-- write-up.
--
-- Same convention as 070/071: ENABLE (not FORCE) ROW LEVEL SECURITY, so the
-- table owner (nocodb, superuser) keeps bypassing by design; only a non-owner
-- role (app_<slug>) is actually subject to these policies.
--
-- Safe to re-run: ENABLE ROW LEVEL SECURITY and CREATE POLICY are guarded by
-- existence checks below.

DO $$
BEGIN
  -- public.users -- owned/root table, own NOT NULL lab_id (same shape as the
  -- 070 root-table loop, just in the public schema instead of pgntarg2udzj1f3).
  EXECUTE $sql$ALTER TABLE public.users ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'tenant_isolation'
  ) THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON public.users USING (lab_id = current_setting('app.current_lab_id', true)::int) WITH CHECK (lab_id = current_setting('app.current_lab_id', true)::int)$sql$;
  END IF;

  -- Per-user filter tables -- no own lab_id column, scoped via a subquery
  -- against public.users, same pattern as every child table in 071.
  EXECUTE $sql$ALTER TABLE public."User_Project_Filters" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'User_Project_Filters' AND policyname = 'tenant_isolation'
  ) THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON public."User_Project_Filters" USING ("user_id" IN (SELECT id FROM public.users)) WITH CHECK ("user_id" IN (SELECT id FROM public.users))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE public."User_Farm_Filters" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'User_Farm_Filters' AND policyname = 'tenant_isolation'
  ) THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON public."User_Farm_Filters" USING ("user_id" IN (SELECT id FROM public.users)) WITH CHECK ("user_id" IN (SELECT id FROM public.users))$sql$;
  END IF;

  EXECUTE $sql$ALTER TABLE public."User_Filter_Settings" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'User_Filter_Settings' AND policyname = 'tenant_isolation'
  ) THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON public."User_Filter_Settings" USING ("user_id" IN (SELECT id FROM public.users)) WITH CHECK ("user_id" IN (SELECT id FROM public.users))$sql$;
  END IF;
END $$;

-- Note: public.labs and public.site_config are intentionally left without RLS --
-- labs is the small cross-lab directory auth.ts consults (via basePrisma) to
-- resolve which lab a login belongs to, and site_config holds deployment-wide
-- settings (Edit Mode, onboarding message text) that are meant to be shared
-- across every lab, not partitioned. Everything else physically in the public
-- schema is inert legacy NocoDB metadata with no Prisma model and no app code
-- path -- see sql/roles/create_lab_role.sql.template, updated alongside this
-- migration to stop granting app_<slug> blanket access to all of public and
-- instead grant only the six tables Prisma actually models there.
