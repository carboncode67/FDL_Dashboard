# Lab-level data silo — implementation plan

Covers **item 10** in `FarmersDatabase/Planned Changes.md` ("Lab level data silo"),
which subsumes **item 13** ("Create silo'd database at the lab level"). Item 3
(Agronomist category) is a per-user precursor of the same idea and is already
shipped — this plan reuses its scaffolding (`lib/get-user-filters.ts`,
`users.category`, migration 063).

> **Status:** in progress, local dev only. Nothing has touched TrueNAS dev or
> production. Progress log in §13.

---

## 1. Goal

Let more than one lab use the same Dashboard deployment without any lab seeing
another lab's data or users. Specifically:

| Requirement | Source |
|---|---|
| A `Lab` organization; every user belongs to exactly one lab | item 10 / 13 |
| Members of lab A cannot see lab B's projects, farms, uploads, forms, tasks, contacts, users, … | item 10 / 13 |
| A **platform admin** (tier above lab `admin`) can see *cross-lab structure* — form definitions, pipeline definitions — and *usage counts* (users, data-collection events) but **not** row-level data (upload files, note text, form responses, transcripts, data rows) | item 10 |
| Some library records — **tests, equipment, methodologies, forms** — can be shared across labs by the platform admin | item 10 |

Non-goals for this plan: farmer-facing OFE Dashboard (already DB-isolated), the
mobile apps (they only talk to bearer-token APIs, which inherit the token's lab).

---

## 2. Guiding principles

The lab currently runs **one** lab's data in production. The user's explicit
instruction: **prioritise production-DB stability over delivery speed.** Every
step in this plan follows from that:

1. **Additive, reversible migrations only.** Add nullable column → backfill →
   verify → *separate later migration* adds `NOT NULL` / FK / RLS. Never a
   destructive or single-shot schema change.
2. **Defense in depth.** App-layer filtering *and* Postgres Row-Level Security
   (RLS). RLS is the authoritative boundary — it fails closed even when a query
   forgets a `where` clause. App-layer filtering keeps queries fast and
   intention explicit.
3. **Dev server first, always.** Every migration and deploy goes to
   `fdl.casata.org` (TrueNAS dev) and soaks before production.
4. **Kill switch.** A `TENANT_ENFORCEMENT` env var (`off` → `soft` → `hard`)
   lets us dial enforcement back instantly without a migration or rollback.
5. **Shadow period.** Run in `soft` mode (context set, violations logged,
   policies permissive) for a week+ before `hard`. With one lab, the expected
   violation count is exactly zero — that's the proof the plumbing is correct.
6. **Backup before every production migration.** `pg_dump` + ZFS snapshot of the
   DB volume, with a written restore procedure, attached to each phase.

---

## 3. Architecture decision

### Chosen: row-level tenancy + Postgres RLS + one DB role per lab

Decisions confirmed with the maintainer:

- **`nocodb` stays as-is — a superuser.** It remains the cross-lab development
  credential (the maintainer uses it to build features across labs) and the role
  that owns the tables and runs migrations. It is **never** used by the running
  app for request traffic.
- A `public.labs` table; `public.users.lab_id` FK → `labs.id`;
  `public.users.platform_admin` boolean.
- A `lab_id` column on every **tenant-root** table (see §4). Child tables inherit
  their lab through their parent FK and are protected by subquery policies.
- **RLS is `ENABLE`d (not `FORCE`d)** on every tenant table. `ENABLE` is enough
  because the app connects as a non-owner, non-superuser role; the table owner
  (`nocodb`) intentionally keeps bypassing RLS for development and migrations.
- **One Postgres role per lab**, e.g. `app_fdl` for the first lab:
  - `NOSUPERUSER`, not a table owner → RLS policies apply to it.
  - `ALTER ROLE app_fdl SET app.current_lab_id = 1` — the lab id is **baked into
    the role**. The app never has to set it per request; every connection made
    with that credential is permanently scoped to that lab at the database level.
  - Granted `SELECT, INSERT, UPDATE, DELETE` on the schema's tables + `USAGE` on
    sequences. No DDL.
  - RLS policy is therefore just
    `lab_id = current_setting('app.current_lab_id')::int`
    (library tables also `OR lab_id IS NULL`).
- The Next.js app holds **one connection string per lab** (`DATABASE_URL__FDL`,
  `DATABASE_URL__<SLUG>`, …) and keeps a `PrismaClient` per lab, selected from the
  session's lab (see §5). Onboarding a lab = create its role + add its env var +
  restart — a deliberate, rare, admin-run event (§10a).
- **`app_platform`** — one more role, `BYPASSRLS`, **`SELECT`-only**, used
  exclusively by `lib/platform-stats.ts` for the cross-lab platform-admin views
  (§6). Read-only + narrow grants keep it far weaker than `nocodb` even though it
  can see every lab's rows.
- The Python **direct-DB consumers** (`Data_ingest_Scripts/*`, `Client/rag.py`,
  `Client/migrate_nyc_watershed.py`) keep connecting as `nocodb` (bypasses RLS),
  but their **write paths must set `lab_id` explicitly** (default: lab 1). This
  is the only change they need and it must land before RLS is enabled on the
  tables they touch (§9 Phase 3).

Why one role per lab instead of a single app role that sets `app.current_lab_id`
per request: the lab boundary is enforced at **connect/authenticate** time, not
per query. A bug in the app — a forgotten scope, a wrong session lookup, a
mis-pooled connection — cannot cross labs, because the credential physically
cannot see the other lab's rows and the app doesn't hold the other lab's
password. It also removes the need to wrap every query in a transaction just to
`SET LOCAL` the GUC. The cost is per-lab role management, which is acceptable at
the expected 2–4 labs and fits the existing "onboarding a lab is a runbook"
posture.

### Why not the alternatives

| Option | Why not |
|---|---|
| **Schema-per-lab / DB-per-lab** (closest to item 13's wording) | Multiplies migration, backup, and connection-pool work by the number of labs. Breaks the single Prisma datasource / schema. Justified at dozens of labs; we expect 2–4. RLS does not preclude moving to this later. |
| **App-layer filtering only** (extend `getEffectiveScope`) | 157 API routes + 80 server pages + 236 files call Prisma with hand-written `where` clauses. Guaranteed to leak the first time someone forgets one. Fails *open*. Unacceptable given principle 2. |
| **Single shared app role + per-request `SET LOCAL app.current_lab_id`** | Works, and is the more common pattern, but isolation then depends on the app getting the GUC right on every request and on `SET LOCAL` transaction scoping holding under the connection pool. Per-lab roles move that guarantee into the database's authentication layer. Given "prioritise data safety over speed", the stronger option wins. |
| **`FORCE ROW LEVEL SECURITY` on `nocodb`** | Would break the maintainer's cross-lab development workflow and make every stray `psql` session silently return zero rows. Rejected — `nocodb` stays superuser by design. |

---

## 4. Schema changes

### New

```
public.labs
  id            serial pk
  name          text not null
  slug          text unique not null    -- lowercase, used in role names + env var names
  db_role       text                    -- e.g. 'app_fdl'; null until the role is provisioned
  created_at    timestamptz default now()
  is_active     boolean default true

public.users
  + lab_id           int  null  -> labs.id      (NOT NULL after Phase 1 backfill)
  + platform_admin   boolean default false      (tier above `admin`)
```

**First row** (inserted by migration 067):
`name = 'Farmers Datalab'`, `slug = 'fdl'`, `db_role = 'app_fdl'`, `id = 1`.
Every existing row in every tenant table backfills to `lab_id = 1`.

### `lab_id` on tenant-root tables

**Owned data** (`lab_id` becomes `NOT NULL`):
`Projects`, `Farms`, `Contacts`, `Tasks`, `Forms`, `Geofences`, `Pipelines`,
`Sampling_Maps`, `MessageTemplates`, `Reporting_Subscriptions`,
`Upload_Categories`, `Tables` (data tables), `Equipment_Loans` (an operational
loan record — who has which drone — not a shareable definition, so it's owned
outright rather than derived),
and the seven upload/attachment tables — `Photos`, `Notes`, `Recordings`,
`Locations`, `Videos`, `Lab_Member_Uploads`, `Documents` (denormalised `lab_id`,
stamped at insert from the resolving user/contact; keeps upload-table RLS
policies index-fast instead of a join through project/farm).

**Shared library data** (`lab_id` **nullable**, `NULL` = visible to all labs):
`Tests`, `Treatments`, `Methodologies`, `Drones`, `Crops`.
Policy: `lab_id = current OR lab_id IS NULL`.

`Treatment_Protocol` is **not** in this list despite living next to `Treatments`
— it has its own `project_id` (a specific rate/timing *as applied in one lab's
project*), so it's correctly a **child** table (below), derived via `Projects`,
not a shareable definition.

### Child tables — no own column, subquery policy

`Fields` (→ `Farms`), `Treatment_Protocol` (→ `Projects`), `Experiment_Zones`,
`Farm_Experiments`, every `Experiment_*` and `Field_*` junction, `Test_Field_Definitions`,
`Test_Data_Rows`, `Form_Field_Definitions`, `Form_Responses`,
`Drone_Flight_Records`, `Drone_Flight_Polygons`, `Geofence_Zones`,
`Geofence_Events`, `Pipeline_Runs`, `Pipeline_Output_Rasters`,
`Context_Fetch_Jobs`, `Context_Rasters`, `Sampling_Map_*`, `Annotations`,
`Cvat_Tasks`, `Task_Assignees`, `Task_Upload_Links`, `Category_Metrics`,
`Upload_Metric_Values`, the `_nc_m2m_*` junctions.

Policy pattern, e.g. `Fields`:
```sql
CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Fields"
  USING ("Farms_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Farms"));
```
The inner `SELECT` is itself RLS-filtered, so policies compose. Acceptable at
our data volume; revisit with partial indexes if a child table ever gets large.

### Junction tables with a space in the name

`_nc_m2m_Projects_Lab Members` (Prisma `ProjectLabMember`) and
`_nc_m2m_Projects_Farms` need quoted identifiers in every policy. Flagged so the
migration author doesn't miss the quoting.

### Column default = the connection's lab (keeps write paths untouched)

Set each `lab_id` column's `DEFAULT` to
`current_setting('app.current_lab_id')::int` (added in the Phase 3 migration,
after backfill). Because `app_fdl` has that GUC baked in, **every `INSERT` the app
makes gets the right `lab_id` automatically** — no `data: { lab_id }` added to
`prisma.x.create()` calls across 157 routes. The RLS policy's `WITH CHECK` clause
then just confirms it matches. App-layer `where: { lab_id }` is still added on
*reads* for clarity, but writes need no change. (The `nocodb`-connected Python
scripts have no GUC, so those must still pass `lab_id` explicitly — §8.)

### Indexing

Every new `lab_id` column gets a btree index; composite
`(lab_id, <existing sort/filter col>)` where the table has an obvious hot query
(e.g. `Photos(lab_id, status)`, `Projects(lab_id, id)`).

---

## 5. Enforcement mechanism (app side)

### Tenant context

- `lab_id` **and `lab_slug`** and `platform_admin` added to the JWT in
  `lib/auth.ts` `jwt()` callback, alongside the existing `role` / `category` (so
  they're picked up at next login, same as role changes). `lab_slug` is what
  selects the connection.
- `lib/lab-db.ts` — the per-lab client registry:
  - `getLabPrisma(slug)` returns a `PrismaClient` from a module-level
    `Map<slug, PrismaClient>`, constructed lazily from
    `process.env['DATABASE_URL__' + slug.toUpperCase()]`
    (e.g. `DATABASE_URL__FDL`). Same global-singleton guard as today's
    `lib/prisma.ts` so dev hot-reload doesn't leak clients.
  - No query wrapping, no `$transaction`, no `SET LOCAL` — the lab scope is baked
    into the role via `ALTER ROLE app_fdl SET app.current_lab_id = 1`, so every
    connection is already scoped. Queries run exactly as they do now.
  - If the env var is missing → throw a clear "lab <slug> has no configured
    database connection" error (surfaces a botched onboarding immediately rather
    than silently falling back).
  - When `TENANT_ENFORCEMENT=off` → returns the bare `nocodb` `prisma` singleton
    (current behaviour, zero risk during Phases 1–2).
- `getTenantPrisma()` — thin wrapper: `getLabPrisma(session.user.lab_slug)`.
  This is what server pages / session-auth API routes call instead of importing
  `prisma`.
- `lib/platform-db.ts` — `getPlatformPrisma()`: a single `PrismaClient` on
  `DATABASE_URL__PLATFORM` (`app_platform`, `BYPASSRLS`, SELECT-only). Used only
  by `lib/platform-stats.ts`. ESLint `no-restricted-imports` blocks it everywhere
  except `app/(dashboard)/platform/**` + `lib/platform-stats.ts`.
- `lib/prisma.ts` (the `nocodb` singleton) stays for migrations tooling and is
  ESLint-flagged as not-for-request-code once the sweep is done.

**Connection budget:** each lab client keeps its own small pool. 4 labs × ~10 +
platform + scheduler ≈ well under Postgres' default `max_connections = 100`, but
size the per-client `connection_limit` explicitly (e.g. `?connection_limit=8`) so
adding labs stays predictable.

### System / non-request code

- **Scheduler** (`lib/scheduler.ts`): iterates active labs, does each lab's work
  through `getLabPrisma(lab.slug)`. (Reporting subscriptions, context-fetch cron.)
- **Webhook routes** (pipelines, CVAT): resolve the record's lab (via `nocodb`
  singleton or `app_platform`), then act through that lab's client.
- These paths select the lab explicitly instead of from a session, but use the
  same per-lab clients — so they're still RLS-scoped, not bypassing.

### The one raw-SQL site

`lib/duplicate-detection.ts` is the only `queryRaw`/`executeRaw` user in the
codebase. Because the connection is already lab-scoped by the role, the raw query
is automatically filtered — but confirm it runs on a lab client, not the `nocodb`
singleton. Small, isolated — noted so it isn't forgotten.

### Bearer-token / external auth

- `lib/upload-auth.ts` `authenticateUpload()` already resolves a `Contact` or
  `User` from the token — both now carry `lab_id` → resolve `lab_slug` →
  `getLabPrisma(slug)` for everything that request does.
- `lib/data-api.ts` and every `/api/data/*` route do the same.
- With one lab, every existing token maps to lab `fdl` → **no behaviour change**
  for OFEDashBot, PipelineProcessor, OFE Dashboard sync, the Client agent, or
  either mobile app.

### App-layer filtering (defense in depth)

Extend `getEffectiveScope()` to also return `labId`. Root-list server pages add
`where: { lab_id: labId }`. This is redundant with RLS by design — it keeps the
query planner honest and makes intent visible in code review. The 23 files
already calling `getEffectiveScope` / `getUserFilters` are the starting worklist.

---

## 6. Platform-admin tier

- `users.platform_admin = true`. A platform admin still has a home `lab_id` and a
  normal `role` for their own lab work.
- New route group `app/(dashboard)/platform/*`, guarded in `proxy.ts` the same
  way `/admin` is (`req.auth?.user?.platform_admin === true`).
- All queries there use `getPlatformPrisma()` (the `app_platform` role —
  `BYPASSRLS`, **SELECT-only** grants) and select **only**:
  - **Counts** per lab: users, projects, farms, contacts, uploads by table,
    form responses, tasks, pipeline runs, drone flight records, geofence events.
  - **Structure**: `Forms` + `Form_Field_Definitions` (field labels/types, no
    responses), `Pipelines` (name, match rules, status, no run I/O).
- Explicitly **never** rendered here: upload file bytes / download links, `Notes`
  content, `Recordings` transcripts, `Form_Responses.data`, `Test_Data_Rows`,
  farm `interview_transcript` / `farm_summary`. Enforced by a hand-written,
  code-reviewed query module (`lib/platform-stats.ts`) — not by pointing generic
  list components at the bypass client. The `app_platform` role having no
  write grants is the backstop: even a bug here can't mutate anything.
- Lab management UI: create/rename/deactivate labs, assign a user to a lab, set
  `platform_admin`, toggle library-record sharing (§7).

Counts are computed with live aggregate queries (`SELECT count(*) ... GROUP BY
lab_id`) — trivial at this scale, no rollup table needed.

---

## 7. Cross-lab sharing

- `lab_id IS NULL` on a `Tests` / `Treatments` / `Methodologies` / `Drones` /
  equipment / `Forms` row = "global, visible to every lab". Policies for those
  tables already include `OR lab_id IS NULL` (added in Phase 3).
- Platform-admin actions:
  - **Promote to global**: `UPDATE ... SET lab_id = NULL` (record becomes
    read-only for lab members; only platform admin edits it).
  - **Clone into a lab**: deep-copy the record + its field definitions with a new
    `lab_id`, so that lab can diverge.
- **Forms**: sharing shares the *definition* only. `Form_Responses` always belong
  to the responder's lab and never cross. The platform-admin forms view shows
  definitions globally; responses stay lab-scoped.
- No share-junction table — a single nullable column covers the requirement and
  keeps every policy a one-liner.

---

## 8. External consumers — impact

| Consumer | Connection | Change needed |
|---|---|---|
| `Data_ingest_Scripts/*.py` | direct PG as `nocodb` (superuser → bypasses RLS) | Keep the `nocodb` connection, but **set `lab_id` on every insert** (default: lab 1). ~4 files. Must land **before** RLS is enabled on the tables they write, else the new rows are invisible to the lab app. |
| `Client/rag.py`, `Client/migrate_nyc_watershed.py` | direct PG as `nocodb` | `rag.py` is read-only over interview data → no change (superuser sees all). `migrate_nyc_watershed.py` is a one-off migration script → set `lab_id` on insert if re-run. |
| OFEDashBot | Dashboard HTTP API (bearer) | None — token's user carries `lab_id`. |
| PipelineProcessor | Dashboard HTTP API (bearer + `PROCESSING_*`) | None functionally; its service `bearer_token` user (`pipeline-processor@service.local`) needs a `lab_id`. |
| OFE Dashboard `lib/fdl-sync.ts` | Dashboard `/api/data/*` (bearer) | None — `FDL_SYNC_TOKEN` user gets a `lab_id`; sync stays within that lab. |
| Client agent (`agent.py`) | Dashboard `/api/data/*` (bearer) | None. |
| Both mobile apps | bearer APIs | None. |

`npx prisma db pull` / hand-run migrations still use `nocodb` — unchanged.

---

## 9. Phased rollout

Each phase: **dev → soak → backup → production**. Ship nothing to production that
hasn't run on `fdl.casata.org` for the stated soak.

### Phase 0 — Investigation & safety scaffolding · *no schema changes*

- [ ] `\du` on both instances — confirm `nocodb` is superuser + owns the schema's
  tables (expected: yes). Note table ownership.
- [ ] Draft `sql/roles/app_fdl.sql` + `sql/roles/app_platform.sql`
  (`CREATE ROLE ... NOSUPERUSER NOLOGIN`? — needs `LOGIN`; `ALTER ROLE app_fdl SET
  app.current_lab_id = 1`; `GRANT USAGE ON SCHEMA`, `GRANT SELECT,INSERT,UPDATE,
  DELETE ON ALL TABLES`, `GRANT USAGE ON ALL SEQUENCES`, and
  `ALTER DEFAULT PRIVILEGES` so future tables are covered). Apply on **local + dev**
  only; production roles come in Phase 3.
- [ ] `pg_dump` baseline of dev and production; write `docs/db-restore.md`.
- [ ] Confirm + document the ZFS snapshot/rollback command for the prod DB volume.
- [ ] Add `TENANT_ENFORCEMENT` env var (`off` default) + the `DATABASE_URL__FDL` /
  `DATABASE_URL__PLATFORM` convention to `lib/lab-db.ts` (stub) and all compose files.
- [ ] Bring `fdl.casata.org` to production data parity for realistic testing.
- [ ] Audit `lib/duplicate-detection.ts` raw SQL — confirm it can run on a lab client.
- **Rollback:** n/a (no prod change).

### Phase 1 — `labs` table + `lab_id` columns · nullable, backfilled, **no enforcement**

- [ ] Migration `067_labs_and_lab_id.sql`:
  - `CREATE TABLE public.labs`; `INSERT` the one existing lab.
  - `ADD COLUMN lab_id int NULL` to `users` + every tenant-root table (§4).
  - `ADD COLUMN platform_admin boolean DEFAULT false` to `users`.
  - Backfill: `UPDATE ... SET lab_id = 1 WHERE lab_id IS NULL` on every table.
  - Add btree indexes on `lab_id`.
  - **No** `NOT NULL`, **no** FK, **no** RLS yet.
- [ ] Verification SQL (run + save output): per table, `count(*)` vs
  `count(lab_id)` — must be equal; `SELECT DISTINCT lab_id` — must be `{1}`.
- [ ] `prisma db pull` + `prisma generate`; commit schema. `lab_id` is an
  optional field nothing reads yet.
- [ ] Deploy app (no functional change). Soak: **3 days** dev.
- **Production behaviour after this phase: identical.** It's a populated,
  unread column.
- **Rollback:** `ALTER TABLE ... DROP COLUMN lab_id` (unused); `DROP TABLE labs`.

### Phase 2 — App-layer tenant context · **still no RLS**, `soft` mode

- [ ] `lib/auth.ts`: `lab_id` + `lab_slug` + `platform_admin` into JWT.
- [ ] `lib/lab-db.ts` (`getLabPrisma` / `getTenantPrisma`), `lib/platform-db.ts`
  (`getPlatformPrisma`). In `soft` mode the lab client still connects as `nocodb`
  (creds for `app_fdl` don't exist in prod yet) but the code path is exercised.
- [ ] `DATABASE_URL__FDL`, `DATABASE_URL__PLATFORM` in all compose files (Phase 2:
  both point at `nocodb`; the real per-lab creds land in Phase 3).
- [ ] Sweep tenant-scoped server pages / API routes to `getTenantPrisma()`;
  scheduler + webhooks to per-lab selection. Start from the 23 `getEffectiveScope`
  callers, then the rest of the 157 routes / 80 pages, entity by entity. Add
  app-layer `where: { lab_id }` on root lists.
- [ ] `upload-auth.ts` / `data-api.ts` / `/api/data/*` resolve lab from token.
- [ ] `TENANT_ENFORCEMENT=soft`: log any result row whose `lab_id` ≠ session lab
  (a lightweight `$extends` result hook, removed once `hard` is stable). No
  policies yet.
- [ ] ESLint rule blocking `getPlatformPrisma` / raw `prisma` import outside
  allowed paths.
- [ ] `tsc --noEmit`, `lint`, `build`.
- [ ] Deploy dev. Soak **7+ days**, watch logs — expect zero violations.
- [ ] Deploy production in `soft`. Soak **7+ days**, watch logs.
- **Rollback:** `TENANT_ENFORCEMENT=off` (instant), or redeploy previous image.

### Phase 3 — Provision per-lab role + enable RLS · roots first, then children

- [ ] Create `app_fdl` + `app_platform` roles on **production**; run the grant
  scripts; `ALTER ROLE app_fdl SET app.current_lab_id = 1`.
- [ ] Point `DATABASE_URL__FDL` at `app_fdl`, `DATABASE_URL__PLATFORM` at
  `app_platform`; restart app. Verify it works with `TENANT_ENFORCEMENT=soft` and
  **no policies yet** — this proves the `app_fdl` grants are complete before any
  policy can hide a bug.
- [ ] Update `Data_ingest_Scripts` (+ `migrate_nyc_watershed.py`) to set `lab_id`
  on insert. Verify an ingest dry-run on dev.
- [ ] Migration `069_lab_id_not_null_and_fk.sql` — Phase 1 proved no nulls:
  `SET NOT NULL` on owned-table `lab_id`; `ALTER COLUMN lab_id SET DEFAULT
  current_setting('app.current_lab_id')::int`; add FK `users.lab_id → labs.id`
  and `<table>.lab_id → labs.id`. Library tables stay nullable, no default.
- [ ] Migration `070_rls_roots.sql`: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
  (**not** `FORCE` — `nocodb` owns the tables and should keep bypassing) +
  `CREATE POLICY tenant_isolation ... USING (lab_id = current_setting('app.current_lab_id')::int)
  WITH CHECK (lab_id = current_setting('app.current_lab_id')::int)`
  on tenant-root tables. Library tables get the `OR lab_id IS NULL` variant on
  `USING` (and a `WITH CHECK` that still pins new rows to the current lab).
- [ ] Flip `TENANT_ENFORCEMENT=hard` (drops the `nocodb` fallback in `lab-db.ts`,
  so a missing per-lab env var now errors loudly). Full manual pass on dev (§10).
  Soak **7 days**.
- [ ] Migration `071_rls_children.sql`: subquery policies on child tables, in
  small batched groups (farms subtree → experiments subtree → forms → pipelines →
  …), each batch soaked on dev before the next.
- [ ] Production: backup + snapshot, then `069` → `070` → `071` on separate days,
  each followed by the §10 smoke test.
- **Rollback:** per table, `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` (fast,
  non-destructive — policies stay defined but inert). Emergency: point
  `DATABASE_URL__FDL` back at `nocodb` and set `TENANT_ENFORCEMENT=off` while
  investigating.

### Phase 4 — Platform-admin tier

- [ ] `app/(dashboard)/platform/*` + `proxy.ts` guard.
- [ ] `lib/platform-stats.ts` — hand-written aggregate/structure queries via
  `getPlatformPrisma()`.
- [ ] Pages: lab list + per-lab stat cards; cross-lab forms (definitions);
  cross-lab pipelines (definitions); lab CRUD; user↔lab assignment;
  `platform_admin` toggle.
- [ ] Move the relevant bits of today's `/admin` (user role editing) to respect
  lab scoping — a lab `admin` manages only their lab's users.
- **Rollback:** feature is additive and read-mostly; hide the nav entry.

### Phase 5 — Cross-lab sharing

- [ ] Platform-admin "promote to global" / "clone into lab" actions for
  `Tests`, `Treatments`, `Methodologies`, `Drones`, equipment, `Forms`.
- [ ] Lab-member UI: show shared (global) library records read-only with a badge.
- [ ] Verify policy already admits `lab_id IS NULL` for those tables.
- **Rollback:** additive.

### Phase 6 — Second-lab dry run · **dev only**

- [ ] Create lab 2 + a test user on `fdl.casata.org`.
- [ ] Verify, both directions: no project/farm/upload/form/task/contact/user
  leakage; global search scoped; Data Access API scoped; mobile upload lands in
  the right lab.
- [ ] Verify platform admin sees lab-2 counts + form/pipeline structure but no
  data.
- [ ] Verify a shared test/form appears in both labs; a shared form's responses
  stay separate.
- Feature is "done" only when this passes.

### Phase 7 — Documentation

- [ ] Root `CLAUDE.md`: DB section (per-lab roles, `labs` table, RLS `ENABLE`,
  `nocodb` stays superuser for dev/migrations, `DATABASE_URL__<SLUG>` convention),
  RBAC section (`platform_admin`), the §10a onboarding runbook.
- [ ] `Dashboard-UI/CLAUDE.md`: `getTenantPrisma` / `getLabPrisma` /
  `getPlatformPrisma` pattern, platform route group, sharing model.
- [ ] Notes in `Data_ingest_Scripts/CLAUDE.md`, `Client/CLAUDE.md`,
  `PipelineProcessor/CLAUDE.md`, `OFEDashBot/CLAUDE.md`, `OFE_Dashboard/CLAUDE.md`.
- [ ] `Planned Changes.md`: mark items 10 and 13 done.

---

## 10. Testing (no test suite exists)

- **SQL verification queries** committed under `migrations/checks/` — run after
  each migration on both instances, output saved to the PR.
- **`scripts/verify-tenant-isolation.ts`** — logs in as users from two labs on
  dev, asserts row counts per entity are disjoint and correct. Run before every
  production RLS deploy.
- **Manual smoke checklist** (`docs/lab-silo-smoke.md`) — the ~15 clicks that
  prove a deploy is healthy: load each root list, open a detail page, create a
  record, run a search, hit `/api/data/uploads` with a token, submit a mobile
  upload. Run on dev after every phase and on prod after every migration.
- **Shadow logging** in `soft` mode is the primary correctness signal for
  Phases 2–3.

### 10a. Lab-onboarding runbook (per new lab, after the feature ships)

A deliberate, admin-run sequence — not self-service:

1. Backup / snapshot the DB.
2. `INSERT INTO public.labs (name, slug, db_role) VALUES ('<Name>', '<slug>', 'app_<slug>')` → note the new `id`.
3. `CREATE ROLE app_<slug> LOGIN PASSWORD '<generated>';`
   `ALTER ROLE app_<slug> SET app.current_lab_id = <id>;`
   run the standard grant script (SELECT/INSERT/UPDATE/DELETE on schema tables, USAGE on sequences, matching `ALTER DEFAULT PRIVILEGES`).
4. Add `DATABASE_URL__<SLUG>` (with `?connection_limit=8`) to the production compose file; restart `app`.
5. Create the lab's first `admin` user with `lab_id = <id>` (seed script or a platform-admin screen).
6. Smoke test: sign in as that user, confirm they see an empty dashboard and cannot see lab 1's data; confirm lab 1 users still can't see the new lab.

Removing a lab: revoke the role, drop the env var, keep the rows (or export + delete under backup).

---

## 11. Decisions — resolved

| # | Decision |
|---|---|
| 1 | **One Postgres role per lab** (`app_fdl`, …), lab id baked in via `ALTER ROLE ... SET app.current_lab_id`. App holds one connection string per lab. Chosen over a single shared app role for a connect-time (not per-query) isolation guarantee. |
| 2 | **`nocodb` stays a superuser** — it's the maintainer's cross-lab development credential and the migration/owner role, never used for app request traffic. RLS is `ENABLE`d, not `FORCE`d, so `nocodb` keeps bypassing by design. |
| 3 | **First lab:** `name = "Farmers Datalab"`, `slug = "fdl"`, `db_role = "app_fdl"`, `id = 1`. |
| 4 | **Python direct-DB consumers** keep their `nocodb` connection; only their insert paths change to set `lab_id` (default 1). Acceptable — ~4 small files. |
| 5 | **`app_platform`** — a `BYPASSRLS`, SELECT-only role for the platform-admin stats views, held by the app in addition to the per-lab creds. |

Still open (not blockers — decide before Phase 4):

- **v1 scope of the platform-admin UI** — is per-lab counts + form/pipeline
  structure + lab/user management enough, or is more cross-lab visibility wanted
  up front?

---

## 12. Rough effort

| Phase | Est. |
|---|---|
| 0 — investigation & scaffolding | 1–2 days |
| 1 — columns + backfill | 1 day + 3 days soak |
| 2 — app-layer context sweep | 5–8 days + 2×7 days soak |
| 3 — per-lab role + RLS enablement | 3–4 days + soak |
| 4 — platform admin | 3–5 days |
| 5 — sharing | 2 days |
| 6 — dry run | 1 day |
| 7 — docs | 1 day |

Working time ≈ 3–4 weeks; calendar time longer because of the deliberate soak
periods. That trade is the point.

---

## 13. Progress log

**2026-09-10 — Phase 0 + Phase 1, local dev only:**

- Fixed two classification errors found while writing the actual migration:
  `Documents` was missing from the owned-table list (§4); `Treatment_Protocol`
  was wrongly listed as shareable library data — it carries a `project_id`, so
  it's a child of `Projects`, not a global definition.
- `migrations/067_labs_and_lab_id.sql` written and applied to **local dev only**
  (`localhost:5433`). Adds `public.labs` (seeded with the one row: id 1,
  "Farmers Datalab", slug `fdl`), `users.lab_id` + `users.platform_admin`, and a
  nullable `lab_id` on the 20 owned tables + 5 shareable-library tables.
  Verified zero nulls across every table post-backfill.
- `prisma/schema.prisma` hand-edited (not `db pull`, to avoid clobbering
  unrelated in-progress changes already on this branch) to add the `Lab` model
  and matching `lab_id Int?` scalar fields — no Prisma relations yet, since
  there's no DB-level FK until migration 069. `prisma generate` + `tsc --noEmit`
  both clean; zero application code touches the new fields yet, so this is
  confirmed to be a no-op for running behavior.
- `sql/roles/` templates added for the per-lab (`app_<slug>`) and platform
  (`app_platform`) roles (§3, §10a).
- **Proof of concept, local dev, cleaned up afterward:** provisioned `app_fdl` +
  `app_platform` from the templates, enabled RLS on `Projects` only, seeded a
  throwaway second lab + one of its projects. Confirmed: `app_fdl` sees only
  its own 5 projects (a direct lookup by the other lab's project name returns
  zero rows); `app_platform` sees across both labs but its `INSERT` is rejected
  (`permission denied` — SELECT-only grant, so even a bug in the platform-stats
  code path can't mutate data); `nocodb` continues to see everything
  unaffected (confirms `ENABLE` not `FORCE` is the right call, and that the
  currently-running local app, which connects as `nocodb`, was never at risk).
  Test policy, test project, and test lab row removed afterward — local DB is
  back to the plain Phase-1 state.

**Next up:** Phase 2 (JWT/`lab_id` plumbing, `lib/lab-db.ts`, sweeping server
pages/routes to the tenant-scoped client) — the large, mechanical part. Nothing
in Phase 0–1 changed any running behavior or touched TrueNAS/production.

**2026-09-10 (same session) — Phase 2 scaffolding started, local dev only:**

- `types/next-auth.d.ts`: `Session.user` / `JWT` carry `lab_id`, `lab_slug`,
  `platform_admin` now (all nullable/optional — safe before migration 069 makes
  `users.lab_id` `NOT NULL`).
- `lib/auth.ts` `jwt()` callback: resolves `lab_id`/`platform_admin` from
  `public.users` and `lab_slug` from `public.labs`; bootstrap account gets
  `lab_id: null`, `platform_admin: true`. Verified the exact queries against
  local dev with a real user row — resolves `lab_id: 1` → slug `"fdl"` correctly.
- `lib/lab-db.ts` — `getTenantPrisma()` / `getLabPrisma(slug)` /
  `getTenantPrismaForLab(slug)` / `getPlatformPrisma()` / `tenantEnforcement()`,
  plus the `soft`-mode result-shape audit described in §5. (One naming
  deviation from §5: `getPlatformPrisma` lives in this same file rather than a
  separate `lib/platform-db.ts` — no `lib/platform-db.ts` needed yet since
  nothing calls it before Phase 4.) **`TENANT_ENFORCEMENT` is unset anywhere
  it matters, so every helper here still returns the plain `nocodb` singleton —
  confirmed via `tsc --noEmit`, `eslint`, and hitting the running local
  container (unaffected, still 200s).**
- `sample_compose.yaml` documents the new optional env vars
  (`TENANT_ENFORCEMENT`, `DATABASE_URL__FDL`, `DATABASE_URL__PLATFORM`).
- **Not started yet:** the actual sweep of the 157 API routes / 80 server pages
  from `prisma` to `getTenantPrisma()`, and the bearer-token paths
  (`upload-auth.ts`, `data-api.ts`). This is the largest remaining Phase 2 item —
  deliberately left for a checkpoint with the user first, given its size and
  the "data safety over speed" priority.

**2026-09-11 — architecture correction + verified core mechanism:**

- Found the naive plan while implementing it: converting `lib/search.ts`
  (11 internal functions, all using the module-level `prisma` import directly)
  showed that threading an explicit client parameter through every function
  that might transitively touch Prisma is exactly the kind of thing a sweep
  could miss somewhere - a shared helper three calls deep, forgotten. **Pivoted
  to `AsyncLocalStorage` + a `Proxy`-wrapped `prisma` export** (`lib/prisma.ts`):
  the *existing* `import { prisma } from "@/lib/prisma"` call sites everywhere,
  including inside shared lib modules that will never be touched, now
  automatically resolve to the request's lab connection. `lib/lab-db.ts`'s
  `runWithLab(labSlug, fn)` is the one primitive route handlers/pages wrap
  their body in; nothing inside the body changes. `getTenantPrisma()` /
  `getTenantPrismaForLab()` from the first pass are gone, replaced by this.
  `basePrisma` (also exported from `lib/prisma.ts`) is the explicit
  always-bypasses handle for the few places that must genuinely span every lab
  before a lab is known: `lib/auth.ts`'s credential lookup and
  `lib/upload-auth.ts`'s token lookup, both updated accordingly.
- Built a throwaway API route + a temporary `proxy.ts` allowlist entry (both
  deleted after) to exercise this for real through the actual Next.js/webpack
  dev runtime (not a mocked test) against local dev, with RLS temporarily
  re-enabled on `Projects` for the duration. Verified, in one request:
  unwrapped `prisma` behaves as `basePrisma`; `runWithLab("fdl", ...)` correctly
  scopes a helper function called **two levels deep** with zero lab-awareness
  of its own; two concurrent `runWithLab` calls for different labs in the same
  process did not bleed into each other; `basePrisma` used *inside* a
  `runWithLab` block still bypasses; and, the actual end-to-end proof - a
  lab-2 project inserted directly via `basePrisma` was visible through
  `basePrisma` but invisible through the `app_fdl`-scoped connection reached
  via `runWithLab`. All test artifacts (route, `proxy.ts` entry, RLS policy,
  throwaway lab-2 row) removed afterward; local DB and the running dev
  container confirmed unaffected (`tsc --noEmit` clean, `200` on `/login`).
- **Next:** sweep API routes/pages to wrap their body in `runWithLab()`,
  starting with the bearer-token (`authenticateUpload`) routes.

**2026-09-11 (same day) - bearer-token route sweep, batch 1 (39 files):**

- Wrapped all 39 `authenticateUpload()`-based bearer-token routes
  (`app/api/upload/*`, `app/api/data/*`, `app/api/farms/[id]/{summary,transcript}`)
  in `runWithLab(auth.labSlug, async () => { ...unchanged body... })`. No other
  line inside any of these files changed - the whole point of the `AsyncLocalStorage`
  pivot above.
- **Mistake made and corrected:** ran a freshly-`npx`-installed `prettier` (no
  project `.prettierrc` exists) over the batch to fix indentation, which
  reformatted entire files under generic default rules - not just my inserted
  lines, but unrelated pre-existing content too. This landed on 6 files that
  already carried the user's own in-progress, uncommitted sampling-maps/forms
  work (4 tracked: `data/forms/route.ts`, `data/forms/[id]/responses/route.ts`,
  `data/sampling-maps/route.ts`, `data/sampling-maps/[id]/route.ts`; 2 untracked
  new files under `data/sampling-maps/[id]/points/`), mixing cosmetic
  reformatting into their pending diffs. **Caught before reporting back.** The
  33 files with no pre-existing changes were reverted to clean `HEAD` and
  re-wrapped without prettier (minimal, insertion-only diffs now). The 6 files
  with the user's own content couldn't be cleanly un-prettified (no snapshot
  from before the mistake), so instead each was read in full and diffed by hand
  to confirm **no logic, field, or value changed - reformatting only** (line-
  wrapping, e.g. `import {...}` split across lines) - verified content-safe,
  disclosed to the user rather than silently left.
- Verification: `tsc --noEmit` clean, `eslint` on all 39 clean (only
  pre-existing warnings, same ones as before touching these files), and a full
  `next build` (production, not just typecheck) succeeded end-to-end with only
  one unrelated pre-existing Turbopack warning (`api/files/[type]/[filename]`'s
  filesystem tracing, nothing to do with this change). Docker dev container and
  local DB confirmed unaffected throughout (`200` on `/login`, row counts
  unchanged).
- **Remaining:** session-auth API routes and server pages (~120 more files) -
  same `runWithLab()` pattern, but the guard/structure varies file to file
  (no single canonical line like `authenticateUpload`'s), so this next batch
  needs more individual attention per file rather than one blind codemod.

**2026-09-11 (later same day) - migration numbering note:** a separate, unrelated feature (bearer-token scope restriction - see `CLAUDE.md`) took migration `068` first. Every not-yet-created migration this plan references is bumped by one (069/070/071 instead of 068/069/070) to stay sequential; nothing else about the plan changes.

**2026-09-11 (later) - session-auth sweep complete (177 files) - Phase 2 done:**

- Wrapped all remaining session-auth API routes (110) and server pages (67) in
  `runWithTenant(async () => { ...unchanged body... })` - same brace-matching
  codemod approach as the bearer-token batch, generalized to not depend on any
  particular guard line (anchors on each function's own `{...}` body instead).
  Excluded 3 pure-webhook routes (HMAC-authed, no session:
  `annotations/webhook`, `pipelines/webhook`, `tasks/vikunja-webhook`) - those
  need a different pattern (resolving the lab from the payload/target record,
  not a session) and are left for later, before RLS ever touches the tables
  they write to.
- **Mistake caught and fixed before verification:** the import-insertion step
  used a regex matching only single-line `import ... ;` statements, which
  mis-inserted the new import mid-statement into any *multi-line*
  `import {\n  A,\n  B,\n} from "...";` block, breaking 3 files
  (`app/(dashboard)/users/page.tsx`, `app/api/annotations/tasks/route.ts`,
  `app/api/tasks/[id]/cvat/route.ts`) with a syntax error `tsc` caught
  immediately. Fixed the regex to match each import statement's closing line
  (wherever `from "...";` appears) rather than any line starting with
  `import`, reverted the 3 broken files (confirmed no pre-existing unrelated
  diffs on them first), and reprocessed just those three.
- Verification, in order: `tsc --noEmit` clean across the whole codebase;
  `eslint` on all 177 files (only 4 pre-existing warnings, none new); a full
  production `next build` succeeded end-to-end. Then real runtime checks
  against local dev, not just static analysis: booted the dev server, hit 9
  pages/routes unauthenticated (all correctly `307` to `/login`, no 500s);
  created a throwaway test user, **logged in for real through NextAuth's
  credentials flow**, confirmed the session correctly carries
  `lab_id: 1, lab_slug: "fdl"`, then hit 11 authenticated pages/routes and got
  clean `200`s with real data on all of them - including `/api/search`, which
  exercises `lib/search.ts`'s 11 internal functions (the exact "shared helper
  with no lab-awareness of its own" case that motivated the whole
  AsyncLocalStorage design) running correctly through the wrapper. Test user
  and dev server torn down afterward; docker dev container and local DB
  confirmed unaffected throughout.
- Also confirmed clean on the pre-existing-changes files this batch touched
  (`app/(dashboard)/farms/[id]/maps/[mapId]/page.tsx` and 5 others) - minimal
  insertion-only diffs, the user's own in-progress `forms`/`formId` work
  fully intact (no repeat of the earlier prettier mistake - no formatter run
  this time).
- **This completes Phase 2.** `TENANT_ENFORCEMENT` is still unset everywhere
  (`off`), so none of this has changed any running behavior yet - it's all
  dormant plumbing, now covering the entire app rather than just the
  bearer-token surface.
- **Also now live:** a real second environment (TrueNAS dev,
  `fdl.casata.org`) with its own fresh Postgres, fully migrated (see the
  migration-bootstrapping gap discovered and documented in `CLAUDE.md` -
  fresh Postgres instances need a schema-only dump/restore first, migrations
  alone assume the base schema already exists from NocoDB). This is the real
  second-environment testbed Phase 3 needs.
- **Next up:** Phase 3 - provision the real `app_fdl` / `app_platform` roles
  on the TrueNAS instance (sql/roles/ templates), flip
  `TENANT_ENFORCEMENT=soft` there, soak, then enable RLS table by table.

**2026-09-11 (later still) - Phase 3 started on local dev; real cross-lab leak found and fixed:**

- Migration `069_lab_id_not_null_and_fk.sql`: re-backfills any stray nulls,
  sets `DEFAULT current_setting('app.current_lab_id', true)::int` on every
  `lab_id` column (owned tables and library tables alike - the `true` argument
  means "NULL instead of erroring" for connections with no such setting,
  e.g. `nocodb`/scripts), then `NOT NULL` + FK-to-`labs` on owned tables only.
  Applied and verified on local dev: the DEFAULT actually populates `lab_id`
  on app-created rows with zero app-code changes once the connection is a
  real per-lab role; NOT NULL and the FK both reject bad inserts as expected;
  library tables correctly still accept `lab_id IS NULL` (global).
- Migration `070_rls_roots.sql`: `ENABLE ROW LEVEL SECURITY` (not `FORCE` -
  `nocodb` stays exempt by design) + a `tenant_isolation` policy on the 20
  owned root tables (`lab_id = current lab`) and the 5 library tables
  (`lab_id = current lab OR lab_id IS NULL` for reads, no `OR NULL` on
  writes - matches §7's "a global record is read-only to ordinary lab
  members" design). Applied and verified on local dev.
- **Full CRUD verified for real** against local dev with `TENANT_ENFORCEMENT=hard`
  and the app actually connecting as `app_fdl` (not `nocodb`) for the first
  time: logged in through a real NextAuth session, created/edited/deleted a
  project through the actual UI-facing API routes - all correct, including
  the delete correctly requiring Edit Mode (a pre-existing, unrelated
  permission gate, confirmed by toggling it and re-testing).
- **Then the two-lab isolation test that mattered most found a real leak.**
  Created a second lab + a project in it directly via the bypass connection,
  then from the lab-1 session: every page and the bearer/session data routes
  correctly hid it (`/projects/13` -> `404`, not in the projects list) -
  *except* `GET /api/search`, which returned it in results. Root cause:
  `app/api/search/route.ts` only imports `lib/search.ts` (which touches
  Prisma) and never imports `@/lib/prisma` directly - so it was invisible to
  the file-discovery grep used for the whole session-auth sweep (`grep -rl
  '"@/lib/prisma"' app/api`), and was never wrapped in `runWithTenant`. Not a
  flaw in the AsyncLocalStorage mechanism itself (already proven correct
  earlier) - a gap in how "which files need wrapping" was enumerated.
  - Fixed by computing the *transitive* closure of every `lib/*.ts` module
    that touches Prisma (directly or via another lib file), then finding
    every `route.ts`/`page.tsx` that imports any of them and isn't already
    wrapped. Confirmed no deeper indirection exists beyond one hop (the
    transitive closure added zero new libs beyond the direct-import set).
  - This surfaced 5 candidates total: `api/search` (the real leak, fixed);
    `api/admin/edit-mode` and `api/admin/onboarding-message` (touch only
    `public.site_config`, which has no `lab_id`/RLS - not a leak, wrapped
    anyway for consistency); `api/auth/[...nextauth]` (the NextAuth handler
    itself - must never be wrapped, it's what *establishes* the session
    `runWithTenant` depends on) and `api/whatsapp/send` (imports `lib/auth.ts`
    only for the `auth()` call, touches no tenant data at all) - both
    correctly left alone, verified by reading the full file.
  - Re-ran the exact leak scenario after the fix: `hits: []` for the lab-2
    project, `13` hits for an ordinary in-lab search term - the fix is
    precisely scoped, not a blunt "search returns nothing" regression.
  - `app/(dashboard)/layout.tsx` (site_config only, same as the two admin
    routes) and `app/layout.tsx`'s `startScheduler()` call (module-load-time,
    not per-request - needs its own per-lab-iteration handling, not a
    request wrap) were reviewed and correctly left alone; the scheduler
    piece is already tracked as a separate to-do.
- All test artifacts (lab 2, its project, the throwaway test user, Edit Mode
  toggle) cleaned up afterward; local DB back to baseline (5 projects, 1 lab);
  docker dev container confirmed unaffected throughout. `tsc`, `eslint`, and
  a full production `next build` all clean on the final state.
- **Next:** batch child-table RLS policies (migration `071`), then replicate
  this exact, now-proven sequence on the TrueNAS instance.

**2026-09-11 (final) - Phase 3 fully done on local dev (roots + all 47 child tables):**

- Migration `071_rls_children.sql`: RLS on every remaining table in
  `pgntarg2udzj1f3`. Derived the table -> linking-column mapping
  programmatically from `information_schema` foreign keys, filled the gaps
  (several relations - `Fields.Farms_id`, all the `_nc_m2m_*` junctions -
  have no actual DB-level FK constraint, a NocoDB-era schema quirk; verified
  those column names against `prisma/schema.prisma` instead) and
  cross-checked total coverage (72 tables = 25 in migration 070 + 47 here)
  programmatically rather than by eye. `Form_Assignments` and
  `Geofence_Assignments` (each has 4 mutually-exclusive nullable parent FKs)
  get an OR-composed policy across all four possible parents. Multi-hop
  children (e.g. `Sampling_Points` -> `Sampling_Maps` -> ... ) just reference
  their *direct* parent - Postgres composes the chain correctly on its own
  since each parent's subquery is itself subject to that table's own policy.
- Applied and verified thoroughly on local dev: broad sweep of 17 pages
  touching these child tables, all correct. One instructive non-bug: `/fields/1`
  404'd - that Field has `Farms_id = NULL` (1 of 2762 rows, a pre-existing
  data-quality outlier, unrelated to today's work) and the RLS policy has no
  `OR Farms_id IS NULL` branch for Fields (unlike the library tables), so it's
  now correctly invisible everywhere instead of only being reachable through
  nocodb's bypass. Worth remembering before enabling RLS on any table in a
  real environment: rows with a NULL parent FK go dark, which can look like
  data loss if you don't already know why.
- **The full two-lab isolation test, on a child table this time**: created a
  second lab, a farm in it, and a *field* in that farm (a child table with no
  own `lab_id` column) directly via the bypass connection. From the lab-1
  session: the farm, the field, and a lab-2 contact all `404`, search finds
  nothing. Confirmed at the raw-SQL layer too, not just through the app:
  `nocodb` sees the field, a direct `app_fdl` connection querying the same
  row by id gets zero rows back - the isolation holds independent of any
  application code, exactly the guarantee RLS is supposed to provide.
- All test data cleaned up; local dev DB back to exact baseline (36 farms,
  2762 fields, 1 lab); docker dev container unaffected throughout.
- **Phase 3 (local) is now complete and thoroughly verified**: roots, library
  tables, and all 47 child tables under real RLS, full CRUD proven to work
  through the real `app_fdl` role, one real cross-lab leak found and fixed
  along the way (see the `/api/search` entry above), zero known gaps
  remaining on local dev.
- **Next:** replicate migrations 067-071 and the `app_fdl`/`app_platform`
  role provisioning on the TrueNAS instance, using the same sequence just
  proven here - migrations first (schema-only, safe), then roles, then flip
  `TENANT_ENFORCEMENT` there once the app itself is updated to actually read
  `DATABASE_URL__FDL` (it isn't yet - Dockerfile/compose env wiring is a
  remaining piece, not yet needed for `off` mode). Still no production
  migrations anywhere in this.

**2026-09-11/12 - Phase 3 replicated on TrueNAS; two real labs onboarded (session paused here):**

- Migrations 069-071 applied to the TrueNAS instance via the same
  `docker exec` runbook as 067/068 - clean, `0/0` nulls, `72` RLS policies,
  matching local dev exactly.
- `app_fdl` + `app_platform` roles provisioned there from `sql/roles/`.
  `TENANT_ENFORCEMENT` taken through `off` -> `soft` -> `hard` on that
  instance, each step confirmed working before advancing.
- **Two real bugs hit and fixed along the way, both now documented so they
  don't repeat:**
  1. Role passwords generated via `openssl rand -base64` contained `/`/`+`,
     which broke Prisma's connection-string parsing (`invalid port number in
     database URL` - a confusing error for what's actually an unescaped-URI
     problem). Fixed by switching to `openssl rand -hex` for all role
     passwords going forward (`sql/roles/README.md` updated) and
     percent-encoding the two already-generated ones in place.
  2. A stale JWT session (issued before the new image with `lab_slug`
     existed) hit `runWithLab()`'s hard-mode guard - exactly the scenario
     that guard's error message anticipates ("ask the user to sign out/in").
     Signing out and back in resolved it; this is expected, documented
     behavior (JWT fields only refresh at next login), not a bug.
- Rebuilt and pushed a new `ghcr.io/carboncode67/fdl-server:latest` image
  from the full session's code (the TrueNAS deployment had been running a
  pre-session image the whole time - the DB side was tested live all along,
  but the *application* code was never actually deployed there until this
  point). This is also the reason the very first write attempt under `hard`
  silently failed: old app code has no lab-awareness, always connects as
  `nocodb`, and `nocodb` has no `app.current_lab_id` GUC - so migration 069's
  `NOT NULL` + GUC-based `DEFAULT` on `lab_id` rejected every insert from
  that stale code with no visible error surfaced to the user.
- **Onboarded two real, additional labs** (not throwaway test data) via the
  manual §10a runbook, run for the first time for real: `Goebel` (id 2,
  admin `mg567@cornell.edu`) and `Botanic Gardens` (id 3, slug `cbg`, admin
  `tedkoch00@gmail.com`), alongside the original `Farmers Datalab` (id 1).
  Each got its own `app_<slug>` role, `DATABASE_URL__<SLUG>` wired into the
  app's env, and a real admin user. `\gset` inside the `docker exec` `psql`
  session correctly captured each lab's auto-assigned id for the role/user
  SQL that followed, rather than hardcoding ids.
- Session paused here at the user's call, before the final live cross-lab
  verification (log into each of the three accounts, confirm isolation) -
  that's the natural next step. Also still open: sanity-check that
  OFEDashBot/PipelineProcessor/OFE_Dashboard's existing `fdl`-lab service
  tokens are unaffected (should be - none of their code paths changed - but
  not yet explicitly re-verified against this live instance).
- Still true throughout: **no production migration, role, or deploy of any
  kind** - everything above is local dev and the TrueNAS sandbox only.

**2026-09-15 - Migration 072 (public.users RLS) + 073 (map survey columns)
applied and verified on local dev:**

- Confirmed baseline first: `relrowsecurity = f` on `public.users` and zero
  `public` schema policies before applying anything.
- `073_map_survey_responses.sql` (unrelated additive columns for Planned
  Changes #13 - `Form_Responses.lat/lng/altitude/h_accuracy/fix_quality/
  external_gps`, `Sampling_Maps.proximity_radius_m`) applied clean, no
  dependencies on 072.
- `072_public_users_rls.sql` applied clean via `docker exec ... psql -U
  nocodb`. Verified directly: `relrowsecurity = t` / `relforcerowsecurity = f`
  on all 4 tables (`users` + the 3 per-user filter tables), `tenant_isolation`
  policy present on each, and `nocodb` (table owner) still sees all 6 rows in
  `public.users` unfiltered - matches the ENABLE-not-FORCE design exactly.
- **Closed the two specific risk paths this migration could have hit, by
  reading the code rather than assuming:**
  1. `lib/auth.ts`'s credential lookup imports `basePrisma` directly (never
     the tenant-scoped `prisma` proxy) - by design, per its own comment,
     since you don't know a user's lab until you've found their row. Login
     is fully unaffected by RLS on `public.users` regardless of
     `TENANT_ENFORCEMENT` mode.
  2. This session's still-open worry item - whether OFEDashBot/
     PipelineProcessor/OFE_Dashboard's service bearer tokens would be
     affected - is resolved: `lib/upload-auth.ts`'s token lookup also uses
     `basePrisma` (see its own comment: `runWithLab(auth.labSlug, ...)` only
     happens *after* this returns), and every bearer-token route already
     wraps its handler in `runWithLab()` post-auth (confirmed by grep across
     all of `app/api/data/*` and `app/api/upload/*`). So a service token's
     initial lookup is always unscoped, and everything it does afterward is
     correctly scoped to *that token's own* `lab_id` - for OFE_Dashboard's
     `FDL_SYNC_TOKEN` (`lab_id = 1`, the `fdl` lab), this changes nothing
     about what it can already see.
- Local dev app container (`dashboard-ui-app-1`) is currently still on a
  plain `nocodb` `DATABASE_URL` (not `app_fdl`) - confirmed via
  `docker exec ... printenv` - so this change has zero effect on it either
  way; the verification above was done directly against the DB, not through
  a running app session.
- **Not yet done: applying either migration to TrueNAS.** Given the app
  there genuinely connects as `app_fdl`/`app_goebel`/`app_cbg` under
  `TENANT_ENFORCEMENT=hard` with 3 real onboarded labs, 072 will have an
  immediate, real effect there (that's the point) - same `docker exec`
  runbook as 067/068, but recommend a quick post-apply smoke check (one
  login per lab, one cross-lab query) given real admins depend on that
  instance, even though the mechanism itself is now verified safe.

