# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # start dev server on :3000
npm run build        # production build
npm run lint         # eslint check
npx prisma generate  # regenerate Prisma client after schema changes
npx prisma db pull   # sync schema from live DB (use with care — will overwrite)
```

No test suite exists yet.

## Architecture

Next.js 16 App Router with two route groups:
- `app/(auth)/` — unauthenticated pages (`/login`)
- `app/(dashboard)/` — all protected pages, wrapped in the shell layout

**Shell layout** (`app/(dashboard)/layout.tsx`): `Sidebar` + `Header` + `<main>`. The `AuthSessionProvider` wraps here to make `useSession()` available to client components.

**Page pattern — server/client split:** Every list and detail page is a server component that fetches data via Prisma, then passes plain serializable data to a `*-client.tsx` client component that handles state (search, slide-over open/close, row clicks). Do not fetch from API routes in server components — use Prisma directly.

**API routes** (`app/api/[entity]/route.ts`) exist for client-side mutations (form POSTs, PUTs, DELETEs). They are thin wrappers around Prisma — no business logic layer.

**Form pattern:** `SlideOverForm` (shadcn `Sheet`, 480px) wraps entity-specific form components from `components/forms/`. Forms call the REST API, then invoke `onSuccess()` which calls `router.refresh()` to re-run the server component. Detail pages for primary entities (Projects, Farms, Fields) use shadcn `Tabs`.

**Auth** (`lib/auth.ts`, `proxy.ts`): NextAuth v5 beta with JWT sessions + credentials provider. `proxy.ts` is the route guard (Next.js 16 renamed `middleware.ts`). Bootstrap account `admin@lab.com` / `admin123` works when no rows exist in `public.users`.

## Database

PostgreSQL at `10.0.1.10:5432`, database `nocodb`. **All data tables live in the `pgntarg2udzj1f3` schema** — not `public`. The `public` schema holds only `users` (app-managed) and NocoDB's internal metadata tables.

Prisma schema uses the `multiSchema` preview feature — this must stay in the generator block or `@@schema()` directives will error. **Use Prisma 6, not 7** — Prisma 7 moved datasource config to `prisma.config.ts`, breaking this setup.

NocoDB junction table FK columns do **not** use conventional `snake_case`. They use `TableName_id` format:
- `_nc_m2m_Projects_Farms` → `Projects_id`, `Farms_id`
- `_nc_m2m_Projects_Lab Members` → `Projects_id`, `Lab Members_id` (space in column name, handled via `@map`)
- `_nc_m2m_Fields_*` → `Fields_id`, `Tests_id` / `Crops_id` / `Drones_id`

NocoDB also co-owns these tables. Never drop `_nc_m2m_*` tables via SQL — remove relationships through the NocoDB UI instead. When adding columns to NocoDB-managed tables via SQL, also INSERT into `public.nc_columns_v2` with `base_id = 'pgntarg2udzj1f3'` and `source_id = 'bw8u74ygq5uhtnh'` (both NOT NULL). New tables created via SQL won't appear in NocoDB until you trigger a sync from the NocoDB Data Sources UI.

## UI conventions

- **shadcn/ui** components in `components/ui/` — do not modify these directly; re-run `npx shadcn@latest add` to update.
- `cn()` from `lib/utils.ts` (clsx + tailwind-merge) for conditional classes.
- Geometry fields (`Fields.geometry`, `ExperimentZones.geometry`) are stored as raw GeoJSON strings (varchar). Geometry input is intentionally absent — it is populated by external API automation. Display only (read-only map panel or raw string).
- Project `Status` is a free-text field in the DB but the UI restricts it to: `Planning`, `Active`, `Complete`, `On Hold`.

## Mobile upload routes

`app/api/upload/{photo,recording,note,location}` accept multipart/JSON from the FarmerDataLogger mobile app. Auth is Bearer-token via `lib/upload-auth.ts` (looks up token in `Contacts` table — separate from NextAuth). All four routes require `export const runtime = "nodejs"` for file I/O. Files are written to `DATA_DIR` env var (defaults to `./upload-data`); metadata rows go to `Photos`, `Recordings`, `Notes`, `Locations` tables.

`app/api/contacts/:id/qr` generates a QR code data URL encoding `{ url: SERVER_URL, token }` for onboarding the mobile app. `NEXTAUTH_URL` is used as the fallback server URL.

## Deployment

`Dockerfile` and `docker-compose.yml` are at the root. The app expects: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `DATA_DIR`. The `.env.local` file is for local dev only and must not be committed.
