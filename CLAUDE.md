# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The root `../../CLAUDE.md` covers the shared database schema, migration workflow, and deployment process (used by multiple components in this platform). This file covers everything specific to Dashboard-UI: the patterns below plus the full feature architecture (auth, roles, uploads, CVAT, messaging, data sorting, tasks, custom forms, geometry, and more) at the bottom of this file.

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

## Spatial context ("Pull spatial context")

Per-farm environmental rasters (soil / terrain / drought, later imagery) fetched from the ScienceVersa **GeoDaRT** API. Entry point is a card on the farm detail page's Overview tab (`components/spatial-context-card.tsx`).

- **Client** (`lib/geodart.ts`): TS port of GeoDaRT's async HTTP contract — `submitJob → getJob → jobDownloadLink`. GeoDaRT does the AOI clipping and COG conversion, so nothing here needs GDAL. `aoi_coords` **must be a bare `[[lon,lat],…]` ring** — GeoJSON geometry/Feature dicts, bbox arrays and WKT are all rejected. Products: `POLARIS`, `USGS3DEP_10m`, `USDroughtMonitor` need no key (placeholder guid+email); `SOLUS`, `Sentinel2` need `GEODART_PASSWORD_HASH` which GeoDaRT hasn't issued yet. All `GEODART_*` env vars optional.
- **Worker** (`lib/context-fetch.ts`, wired into `lib/scheduler.ts` on a `*/2 * * * *` cron): `advanceContextJobs()` claims each in-flight `Context_Fetch_Jobs` row (optimistic `claimed_at` lock), (re)submits `pending` ones, polls `submitted`/`running` ones, and on a terminal GeoDaRT status streams the signed zip to a temp file, `yauzl`-extracts each `.tif` into `DATA_DIR/context/` as a flat `ctx_<jobId>_<product>_<NN>.tif`, and writes `Context_Rasters` rows.
- **DB**: `Context_Fetch_Jobs` (one per pull — `products[]`, date range, `aoi` ring, `status` pending|submitted|running|success|partial|failed, `product_results` JSONB) and `Context_Rasters` (one per file — `product`, `filename`, `bytes`, `sha256`, `footprint`, `capture_date`). Migration `054_context_rasters.sql`.
- **API**: `POST /api/farms/[id]/context` (session + `canEdit`) builds the AOI from the farm's `Fields`/`ExperimentZones` geometry via `lib/geo.ts` `geojsonBounds`+`bboxRing`, submits, creates the job row (`pending` if GeoDaRT is unreachable — cron retries). `GET /api/context/jobs/[jobId]` is a plain status read the card polls every 5 s.
- **Serving**: rasters are served by the existing `GET /api/files/context/[filename]` route (`"context"` added to `ALLOWED_TYPES`, `tif`→`image/tiff`). It already does HTTP range requests, so COGs are directly usable by a web map / tiler / `rio-tiler`.

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

## Dashboard architecture (`Dashboard-UI/`)

**This project uses Next.js 16**, which has breaking changes from Next.js 14/15 — APIs, conventions, and file structure differ from training data. Route guards live in `proxy.ts` (not `middleware.ts`, which Next.js 16 renamed). Read the `node_modules/next/dist/docs/` guides before making changes.

Next.js 16 App Router with two route groups:
- `app/(auth)/` — unauthenticated pages (`/login`)
- `app/(dashboard)/` — protected pages wrapped in Sidebar + Header shell

**Server/client split:** List and detail pages are server components that query Prisma directly, passing serializable data to `*-client.tsx` client components for state (search, slide-over, row clicks). Do not call API routes from server components — use Prisma directly.

**API routes** (`app/api/[entity]/route.ts`) are thin Prisma wrappers used only for client-side mutations (create, update, delete).

**Form pattern:** `SlideOverForm` (shadcn `Sheet`, 480 px) wraps entity forms from `components/forms/`. On success, forms call `router.refresh()` to re-run the server component. Primary entities (Projects, Farms, Fields) use shadcn `Tabs` on detail pages.

**Auth** (`lib/auth.ts`): NextAuth v5 beta, JWT sessions, credentials provider. `proxy.ts` is the route guard. Bootstrap account `admin@lab.com` / `admin123` is active only when `public.users` is empty — disabled automatically once any real account exists. `proxy.ts` also redirects non-admins away from `/admin/*` routes.

**Role-based access control:** Three roles stored in `public.users.role`: `"admin"`, `"member"`, `"viewer"`. Role is embedded in the JWT at sign-in (changes take effect at next login). Permission helpers live in `lib/roles.ts` (`canCreate`, `canEdit`, `canDelete`, `isAdmin`). Global **Edit Mode** is stored in `public.site_config` and read/written via `lib/edit-mode.ts`; when on, members can delete records.

| Role | Create/Edit | Delete | Admin panel |
|------|-------------|--------|-------------|
| `admin` | ✓ | Always | ✓ |
| `member` | ✓ | Only when Edit Mode is on | — |
| `viewer` | — | — | — |

Server pages fetch role + edit mode with `const [session, editMode] = await Promise.all([auth(), getEditMode()])` then pass `canCreate(role)`, `canDelete(role, editMode)` as props to client components. All mutation API routes (`DELETE`/`PUT`/`POST`) check session role and return 401/403 — except upload routes (`/api/upload/*`) which use Bearer token auth. The data-sorting PATCH (`/api/uploads/[table]/[id]`) is auth-only (no role restriction — viewers can categorize).

**Admin panel** (`app/(dashboard)/admin/`): Tier 1 only. Lets admins toggle Edit Mode, change user roles, and edit the onboarding message sent to farmers (IRB-compliance text stored in `site_config` under key `"onboarding_message"`; falls back to `DEFAULT_ONBOARDING_MESSAGE` in `lib/onboarding-message.ts` if no row exists). API routes under `app/api/admin/` (`edit-mode`, `onboarding-message`, `users` incl. per-user project filters). There is no separate Lab Members table — lab-member fields (`bearer_token`, `position`, `contact_phone`, `faa_part_107`, `status`) live directly on `public.users`.

**Admin role recovery:** If all admin accounts are lost, promote a user directly: `UPDATE public.users SET role = 'admin' WHERE email = '<email>';`. The user must sign out and back in for the JWT to reflect the new role.

**Login rate limiting** (`lib/rate-limit.ts`): In-memory sliding window, 10 attempts per IP per 15 minutes. Reads `CF-Connecting-IP` header first (Cloudflare tunnel), then `x-real-ip`, then `x-forwarded-for`. Nginx Proxy Manager must forward: `proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;`.

**Mobile upload routes** (`app/api/upload/{photo,recording,note,location,video,document,contact-card}`): Bearer-token auth via `lib/upload-auth.ts`. The auth check tries `Contacts.token` first, then `public.users.bearer_token` — returning a tagged union `{ kind: "contact", contact } | { kind: "labMember", labMember: User }`. The two auth kinds route to different storage:
- `contact` → `Photos` / `Recordings` / `Notes` / `Locations` tables; farm resolved from `contact.farms_id` (or GPS proximity if `is_lab_member` is true on the contact)
- `labMember` → `Lab_Member_Uploads` table; farm always resolved by GPS proximity via `lib/proximity.ts`

`lib/proximity.ts` implements ray-casting point-in-polygon against field geometries to find the containing farm. `resolveFarmIdForLabMember(lat, lng)` is the entry point for lab member uploads; `resolveFarmId(contact, lat, lng)` handles contacts.

**Duplicate-upload detection:** all four routes (photo/recording/note/location) dedup by a client-supplied `content_hash` (SHA-256, computed on-device at capture time — see the mobile app sections below) before doing any DB insert, via `findFirst` on `content_hash` — not a DB-enforced unique constraint, same pattern as the older `ticket_ref` field. Photo/recording dedup is global (identical file bytes across submitters is effectively impossible, and this also survives a device re-onboarding with a new token); note/location dedup is scoped to the same `contact_id`/`lab_member_id` (short text and GPS tracks have real cross-submitter collision risk). Falls back to `ticket_ref` (exact match, contact path only — guards against OFEDashBot firing the same Twilio webhook twice) when no hash is present. A dedup hit returns `{ ok: true, duplicate: true, id }` with a 2xx status; both mobile apps already treat any 2xx as upload success, so no client-side response-parsing changes were needed for this to work correctly.

`export const runtime = "nodejs"` is required on all upload routes (file I/O).

The **recording route** uses `busboy` for streaming multipart parsing — the file is piped directly to disk without buffering in the JS heap. Do not replace this with `request.formData()`: on the 512 MB DO droplet, buffering a large audio file in Node.js heap triggers an OOM kill. The `fieldSize` limit is set to 10 MB to accommodate large GPS track fields.

**File serving route** (`GET /api/files/[type]/[filename]`): Serves uploaded files from `DATA_DIR`. Allowed types: `photos`, `recordings`, `locations`. Validates filename with `path.basename` to prevent directory traversal.

**Contacts entity** (`app/(dashboard)/contacts/`): Manages farmer/field contacts for the FarmerDataLogger app. Creating a contact through the Dashboard UI generates a random 32-byte hex token (NocoDB-created contacts have an empty token and cannot onboard). `GET /api/contacts/:id/qr` returns a QR code data URL encoding `{ url, token }`. Additional fields on `Contact`: `channel` (`"whatsapp" | "sms" | null`), `assigned_experiment_id` (FK to `Farm_Experiments`, with nickname override in `experiment_nickname`), `onboarded_at` (timestamp, persisted when onboarding message is sent). `PUT /api/contacts/:id` is a full overwrite; use `PATCH /api/contacts/:id` for partial updates (channel, experiment assignment, onboarded_at) to avoid blanking other fields.

**Lab Members entity** (`app/(dashboard)/lab-members/`): Manages lab researchers who use the FarmerDataLogger app. Backed by `public.users` (not a separate table). Same QR onboarding flow as Contacts — `POST /api/lab-members/:id/token` writes a random token to `users.bearer_token`, `GET /api/lab-members/:id/qr` generates the QR code. Uploads from lab members land in `Lab_Member_Uploads` (not the per-media-type tables) and are viewable at `/lab-uploads`. Farm auto-assignment is by GPS proximity, not a fixed farm on the record.

The QR `url` field comes from `process.env.FARMER_SERVER_URL ?? process.env.NEXTAUTH_URL` — set `FARMER_SERVER_URL` separately when the external port differs from the container port.

**Messaging page** (`app/(dashboard)/whatsapp/`, route `/whatsapp`, nav label "Messaging"): Lists all contacts who have `whatsapp: true` OR a non-null `channel`. Supports sending WhatsApp or SMS messages via OFEDashBot. Features: per-contact channel dropdown (None/WhatsApp/SMS, saved via `PATCH`), experiment assignment modal (links a farmer to one of their farm's experiments with an optional farmer-facing nickname), reusable message templates (`MessageTemplates` table, `app/api/message-templates/`), and persistent onboarding tracking (`onboarded_at`). The onboarding message text is fetched server-side from `lib/onboarding-message.ts` and passed as a prop — it is no longer hardcoded. `experiment_name` returned by `GET /api/contacts/by-phone/:phone` is `experiment_nickname || AssignedExperiment.experiment_name || ""`, which is what OFEDashBot uses to populate message receipts.

**Data Sorting** (`app/(dashboard)/data-sorting/`): Unified view of all uploads from all five tables. Users can filter by status/type/search, open an `EditPanel` slide-over to preview media and assign category, description, and project. Saving sets `status = 3` (Sorted). The unified PATCH endpoint is `app/api/uploads/[table]/[id]/route.ts` — `[table]` is validated against an allowlist.

**Upload status codes:** `1` = Unassigned (lab member upload outside all farm polygons), `2` = Farm Matched, `3` = Sorted (human-reviewed, category + description set), `4` = Completed (fully processed).

**Tasks** (`app/(dashboard)/tasks/`): Lab workflow task management linked to experiments. Fields: `description`, `classification` (one of: `image annotation`, `ocr`, `transcription`, `categorization`, `photogrammetric processing`, `image classification`, `spatial analysis`, `data cleaning`, `sampling`, `drone flight`, `tiling`), `status` (`not started` / `in progress` / `complete`), `priority` (`low` / `medium` / `high`), `due_date`. Junction tables: `Task_Assignees` (many users), `Task_Upload_Links` (links any upload record by `upload_id` + `upload_table` pair). The task detail page (`/tasks/[id]`) has an upload picker — a filterable table that lets users bulk-link photos by project/farm. "Send to CVAT" button appears only when `classification === "image annotation"`.

**Task Templates** (`Task_Templates` table): Pre-defined task blueprints attached to a `Test` or `Drone` record (`test_id` / `drone_id` FK). When a test or drone is added to an experiment (PUT `/api/experiments/[farmId]/[experimentId]`), templates for newly added tests/drones are auto-created as `Tasks`. The experiment form surfaces these templates so users can set `due_date` and assignees before saving.

**CVAT annotation integration** (`app/api/annotations/`, `lib/cvat.ts`): Optional integration with a self-hosted CVAT instance for image annotation. `lib/cvat.ts` is the API client (basic auth). Everything is feature-flagged — if `CVAT_URL` is unset, tasks save locally with no error. Two flows create CVAT tasks:
- `POST /api/annotations/tasks` — from a Project's Annotations tab; sends all photos in the project (status ≥ 2)
- `POST /api/tasks/[id]/cvat` — from a workflow Task; sends only the task's linked uploads

CVAT fetches images directly from `GET /api/files/photos/<filename>` (no auth required on that route). `POST /api/annotations/webhook` receives CVAT job-completion events, exports COCO annotations, and stores polygon shapes as JSONB in the `Annotations` table. `Cvat_Tasks.fdl_task_id` links to a workflow Task; `Cvat_Tasks.project_id` links to a Project.

Required env vars (all optional — omit to disable CVAT sync):
```
CVAT_URL=http://your-cvat-host:8080
CVAT_USERNAME=admin
CVAT_PASSWORD=your-cvat-password
CVAT_WEBHOOK_SECRET=random-secret
NEXT_PUBLIC_CVAT_URL=http://your-cvat-host:8080
```

**Outgoing email** (`lib/mailer.ts`): All server-sent email (activity reports, onboarding emails) goes through a single `sendMail()` wrapper around **nodemailer**, using plain SMTP credentials for an existing mailbox (Gmail, Office365, institutional mail, etc.) — not a transactional-email API. Env vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL` (optional, defaults to `SMTP_USER`) — all optional, omit to disable email features. Not in the production compose by default; add them only if email is needed. (A prior version of this used Resend; that's been fully replaced.)

**Activity reports** (`app/api/reporting/`): Sends email digests of recent upload activity, either on-demand (`POST /api/reporting/[id]`) or via `lib/scheduler.ts`'s daily cron check. Requires the SMTP env vars above — omit to disable.

**Onboarding emails**: A "Send Onboarding Email" button on both the Contact detail page (`/contacts/[id]`) and Lab Member detail page (`/lab-members/[id]`) lets a lab member (anyone who passes `canEdit`) send a custom message with the same app-connection QR code shown on that page, attached as a PNG (`lib/qr-code.ts` generates both the on-screen QR and the emailed one from the same payload, so they always match). Routes: `POST /api/contacts/[id]/send-onboarding-email`, `POST /api/lab-members/[id]/send-onboarding-email` — both session-authed, require the recipient to already have an email on file (and, for lab members, an app token — grant access first). This is a separate, standalone channel from the WhatsApp/SMS Messaging page onboarding flow — it doesn't touch `channel` or reuse the Messaging page's send path, though it does set `Contact.onboarded_at` like that flow does.

**Whole-site search** (`lib/search.ts`): Keyword search across farms, experiments, projects, contacts, fields, tests, treatments, tasks, and all five upload tables (case-insensitive substring over curated text columns, snippets with match context). Two thin routes share it: `GET /api/search` (session-auth, backs the header search dialog `components/global-search.tsx`, opened via the Search button or ⌘K) and `GET /api/data/search` (bearer-token, used by the Client agent's `search_db` tool). Query params: `q` (min 2 chars), `entities` (comma list), `limit`.

**Data Access API** (`app/api/data/`): Bearer-token-authenticated routes for external workflows. Shared query logic and types live in `lib/data-api.ts` (`queryAllUploads`, `buildSuggestedPath`, `NormalizedUpload`). Main endpoints, all require `Authorization: Bearer <token>`:
- `GET /api/data/uploads` — flat paginated list across all 5 upload tables. Query params: `project_id` (comma-sep IDs; filters on the *resolved* project, so farm-fallback uploads are included), `farm_id`, `status` (comma-sep codes), `type` (comma-sep table slugs), `limit` (max 1000), `offset`.
- `GET /api/data/uploads/manifest` — same data grouped as `projects → farms → files[]`. Primary input for file-tree generation scripts. Same query params.
- `GET /api/data/projects` — all projects as `{ id, name, is_member }`; `is_member` comes from the projects↔lab-members junction for the token's user (always false for contact tokens). Used by the Client's "Select Projects" setup picker.
- `GET /api/data/files/[table]/[id]` — download a file by record ID; notes served as `.txt`.
- `PATCH /api/data/uploads/[table]/[id]` — update `status`, `category`, `description`, or `project_id` from an external workflow.
- `GET/POST /api/data/farms`, `GET /api/data/farms/[id]` — farm list/create/detail. `GET/POST /api/data/fields`, `GET/PUT /api/data/fields/[id]` — field list/create/update. `GET/POST /api/data/zones`, `GET/PUT /api/data/zones/[id]` — Experiment_Zones list/create/update. `GET/POST /api/data/farms/[id]/experiments`, `PUT /api/data/farms/[id]/experiments/[experimentId]` (fill-only-if-currently-empty merge, not a general update — built for the onboarding pipeline). **`OFE_Dashboard/` is a live external consumer of these five routes** (`lib/fdl-sync.ts` there) — changing their request/response shape here needs a corresponding update on that side.

`suggested_path` formula: `{project_name | "Unassigned"}/{farm_name | "Unknown Farm"}/{category | "Uncategorized"}/{filename}`. Table slugs are `photos`, `notes`, `recordings`, `locations`, `lab-member-uploads`.

**Custom Forms** (`app/(dashboard)/forms/`, `app/api/forms/`, `app/api/data/forms/`): lab members build arbitrary-field forms (`Form` → `FormFieldDefinition`, the same col_index/JSONB-response pattern as Test data templates below — field defs are delete+recreated on schema edits, so `FormResponse.data` is deliberately not FK'd to them) and assign them to a Contact, a lab-member User, or broadly to a Farm/FarmExperiment (`FormAssignment`, exactly one of four nullable FKs, enforced by a DB CHECK constraint). **Forms are repeatable by design** — there is no "one response per recipient" constraint anywhere; `FormAssignment` governs visibility/eligibility only, fully decoupled from `FormResponse` history, and the admin responses view is a plain chronological log, not a completion tracker. Bearer-token mobile API lives under `/api/data/forms/...` (nested in the already-allowlisted `/api/data` prefix in `proxy.ts`, so no middleware changes were needed): `GET /api/data/forms` (list assigned forms), `GET /api/data/forms/[id]` (schema — 404, not 403, if not assigned, so existence isn't leaked), `POST /api/data/forms/[id]/responses` (submit — label-matched against field defs the same way the Test data template ingest route matches columns, content_hash dedup scoped to submitter). This is the API the FarmerDataLogger Swift app's own Custom Forms feature consumes (see its `CLAUDE.md`) — field types are `text | number | boolean | date | select | photo`. A `photo` answer is stored as a client-computed content_hash string (same shape as every other answer type, no schema change needed) referencing a row in the ordinary `Photos` table rather than embedding image bytes in `FormResponse.data`; the responses admin view (`app/(dashboard)/forms/[id]/responses/`) resolves that hash to a `Photos.filename` at render time, showing "Uploading…" if the photo hasn't landed yet — submission never blocks on the photo finishing its own upload. Known limitation: broad Farm/FarmExperiment assignments resolve to Contact recipients only, since there's no Farm↔User relation in the schema (lab members reach farms by GPS proximity, not a fixed assignment). **Gotcha caught during testing:** in `components/form-schema-builder.tsx`, don't derive a comma-separated text input's displayed `value` by re-joining an already-parsed array (e.g. `options.join(", ")`) — any space or trailing comma typed gets silently stripped on the very next render, before the user can continue typing. The options field keeps a separate raw `optionsText` string decoupled from the parsed `options: string[]` for exactly this reason; apply the same pattern to any future comma-separated-list input.

**Test data templates & lab forms:** Each `Test` has a column schema (`Test_Field_Definitions`, edited via the Data Template builder on `/tests/[id]/edit`) and optional lab form attachments (PDF/Excel in the shared `Documents` table via `Documents.test_id`, routes `/api/tests/[id]/documents`). Collected data rows live in `Test_Data_Rows` — JSONB keyed by `col_index` (deliberately no FK to field definitions, which are delete+recreated on schema edits). Bearer-token endpoints: `GET/POST /api/data/experiment-tests/[id]/rows` (POST matches submitted columns to the template by normalized label; missing columns → 422, extra columns → ignored+reported). Read-only view at `/experiment-tests/[id]/data` ("View Data" link on experiment test rows). **Important:** the experiment PUT updates `Experiment_Tests` / `Experiment_Drone_Flights` in place (diffed by `test_id`/`drone_id`) — do not revert to delete+recreate, which cascade-wipes `Test_Data_Rows` and `Drone_Flight_Records`.

**Drone flight records:** Two levels of tracking. `ExperimentDroneFlight` (table `Experiment_Drone_Flights`) is a *planned assignment* — drone X assigned to experiment Y, N flights expected on a date. `DroneFlightRecord` (table `Drone_Flight_Records`) is an *individual flight record* child of that assignment. One assignment can have many flight records. `Drone_Flight_Polygons` stores GeoJSON annotation features linked to a flight record.

**Farm geocoding:** `Farms` has `address TEXT`, `latitude FLOAT`, `longitude FLOAT` columns. The farm edit form geocodes the address on blur via Nominatim and stores the result. `FarmMap` uses `farmLat`/`farmLng` as the center fallback when no field geometries exist yet.

**Geometry fields** (`Fields.geometry`, `ExperimentZones.geometry`) are stored as raw GeoJSON strings (raw geometry object, not a Feature wrapper). `ExperimentZones.geometry` is populated by ingestion scripts only. `Fields.geometry` can also be created or edited interactively via the draw UI:
- **Draw new field:** `/farms/[id]/draw-field` — full-page overlay (`fixed inset-0 z-50`); POSTs to `POST /api/fields` with `{ Name, Farms_id, geometry, boundary_source: "drawn" }`.
- **Edit field boundary:** `/fields/[id]/draw` — same overlay pattern; PUTs to `PUT /api/fields/[id]`.

Drawing uses **`@geoman-io/leaflet-geoman-free`** attached to the Leaflet map instance. The core client component is `components/field-draw-map.tsx` (dynamically imported with `ssr: false` via `components/field-draw-map-wrapper.tsx`). Import geoman and its CSS at module level in `field-draw-map.tsx`. Map includes an ESRI satellite tile toggle; tile URL pattern is `{z}/{y}/{x}` (not `{z}/{x}/{y}`): `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`.

**UI conventions:** `components/ui/` uses **`@base-ui/react`** (not Radix UI). The `asChild` prop does not exist — use the `render` prop instead: `<DialogTrigger render={<Button />}>label</DialogTrigger>`. Use `cn()` from `lib/utils.ts` (clsx + tailwind-merge) for conditional classes. Project `Status` is free-text in the DB but the UI restricts it to: `Planning`, `Active`, `Complete`, `On Hold`.

**Rendering:** `app/(dashboard)/layout.tsx` exports `dynamic = "force-dynamic"`, which cascades to all dashboard pages. Dashboard pages query Prisma at request time and are never statically prerendered.
