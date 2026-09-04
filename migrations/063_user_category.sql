-- Agronomist user category. An Agronomist is a Lab Member (same public.users row,
-- same mobile app onboarding/token, same GPS-proximity upload flow) except their
-- Dashboard access is hard-scoped to their assigned project(s) instead of the
-- optional personal "Dashboard Filters" every other Lab Member gets. See
-- lib/get-user-filters.ts (getEffectiveScope) and lib/roles.ts.
--
-- Validated at the app layer (like `role`), not with a DB CHECK constraint, so this
-- stays a plain additive column. Existing rows default to 'lab_member' — zero
-- behavior change for anyone who isn't explicitly switched to 'agronomist'.
-- Additive-only, safe to re-run.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'lab_member';
