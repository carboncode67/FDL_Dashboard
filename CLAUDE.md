# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The root `../CLAUDE.md` is the authoritative reference for database layout, deployment, auth, roles, upload routes, CVAT, data-sorting, tasks, and all feature details. This file covers the Dashboard-UI–specific patterns you need to write code correctly.

## Commands

```bash
npm run dev           # dev server on :3000 (requires DB on localhost:5433)
npm run build         # production build
npm run lint          # ESLint
npx tsc --noEmit      # type-check — run after any schema or API change
npx prisma generate   # regenerate client after editing prisma/schema.prisma
npx prisma db pull    # sync schema from live DB (overwrites schema.prisma — use carefully)
```

Migrations live in `migrations/`. Run every new file against both DB instances immediately — a missing column crashes Prisma on any page that touches that model:

```bash
# local dev — set FDL_DB_PASSWORD in your shell first, never hardcode it here
PGPASSWORD=$FDL_DB_PASSWORD psql -h localhost -p 5433 -U nocodb -d nocodb -f migrations/<file>.sql
# production (SSH tunnel must be open on 15432)
PGPASSWORD=$FDL_DB_PASSWORD psql -h localhost -p 15432 -U nocodb -d nocodb -f migrations/<file>.sql
```

All migration files use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` — safe to re-run.

## Route Guard (`proxy.ts`)

`proxy.ts` is the Next.js 16 equivalent of `middleware.ts`. Every new API route that uses Bearer-token auth (not session auth) **must** be added to the `isMobileApi` check or it will 307-redirect to `/login`. The current exemptions are `/api/upload`, `/api/files`, `/api/data`, `/api/contacts`, `/api/whatsapp`, and farm sub-routes ending in `/summary` or `/transcript`. Add new bearer-token routes here before deploying.

## Server / Client Component Pattern

List and detail pages are **server components** that query Prisma directly and pass serializable data down to `*-client.tsx` **client components** for interactivity (search, slide-over, row clicks). Never call API routes from a server component — query Prisma directly there.

API routes (`app/api/[entity]/route.ts`) are used only for client-side mutations (POST/PUT/DELETE). Session-auth routes check `await auth()` and role; bearer-token routes use `await authenticateUpload(req)` from `lib/upload-auth.ts`.

`app/(dashboard)/layout.tsx` exports `dynamic = "force-dynamic"`, which cascades to all dashboard pages — nothing is statically prerendered.

## UI Components

`components/ui/` uses **`@base-ui/react`**, not Radix UI. The `asChild` prop does not exist — use the `render` prop instead:

```tsx
// ✓ correct
<DialogTrigger render={<Button />}>Open</DialogTrigger>

// ✗ wrong — asChild does not exist in @base-ui/react
<DialogTrigger asChild><Button>Open</Button></DialogTrigger>
```

Use `cn()` from `lib/utils.ts` (clsx + tailwind-merge) for conditional class names.

## Form Pattern

Slide-over forms live in `components/forms/`. The wrapper is `SlideOverForm` (shadcn `Sheet`, 480 px). On success, forms call `router.refresh()` to re-run the server component and display updated data — no separate state management needed.

## Geometry

`Fields.geometry` and `ExperimentZones.geometry` are stored as raw GeoJSON geometry objects (not Feature wrappers) in TEXT columns. The draw UI (`components/field-draw-map.tsx`, dynamically imported via `field-draw-map-wrapper.tsx`) uses `@geoman-io/leaflet-geoman-free`. ESRI satellite tiles use `{z}/{y}/{x}` order (not `{z}/{x}/{y}`).

## Key `lib/` Modules

| File | Purpose |
|---|---|
| `auth.ts` | NextAuth v5 config, JWT sessions |
| `upload-auth.ts` | Bearer-token auth for mobile/external routes; returns `{ kind: "contact" \| "labMember", ... }` |
| `roles.ts` | `canCreate`, `canEdit`, `canDelete`, `isAdmin` permission helpers |
| `edit-mode.ts` | Reads/writes global Edit Mode flag from `public.site_config` |
| `proximity.ts` | Ray-casting point-in-polygon for GPS-based farm assignment |
| `data-api.ts` | Shared logic for the external Data Access API (`/api/data/`) |
| `prisma.ts` | Singleton Prisma client |
