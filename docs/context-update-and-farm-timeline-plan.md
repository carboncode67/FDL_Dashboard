# Spatial Context Update/Expand + Farm Data Timeline — plan

Status (2026-11-13): **all phases (1–6, incl. 5b) implemented**, uncommitted. Migrations 095 + 096 (FDB) and `20261113190533_management_event_fdl_push` (OFE) are applied to local dev only; TrueNAS and production still need them. Not done from §2.2: the 'only show map pins within ±N days' option (listed there as phase 2), and tooltips are hover/focus only (no touch-and-hold). Not verified in a browser yet.

Two changes to the farm page:

1. **Spatial Context: Update / Expand instead of re-pulling.** When a farm has no context, the card stays as it is now ("Pull spatial context" with the date-range dialog). Once a pull has succeeded, the main action becomes **Update** (fetch from the end of what we have up to the newest data available) and **Expand** (widen the date range already pulled). Neither one downloads anything we already hold.
2. **A fuller farm timeline.** Today's timeline under the farm map shows only drought weeks and Sentinel-2 dates. It gets bigger, and it also shows data-collection events: photos, notes/observations, recordings, uploads, form responses, drone flights, and (in OFE) management entries.

---

## 0. Where things stand today

| | FDB (Dashboard-UI) | OFE_Dashboard |
|---|---|---|
| Context pull UI | `components/spatial-context-card.tsx`. One "Pull spatial context" dialog: products, start/end, buffer | **None.** `fields/[id]/context/page.tsx` is a `ComingSoon` placeholder; `ContextLayer` model unused |
| Pull backend | `POST /api/farms/[id]/context` → `lib/context-fetch.ts` `requestContextFetch()` → GeoDaRT; cron `advanceContextJobs()` ingests to `Context_Rasters` | None. Reads FDL rasters via `lib/fdl-rasters.ts` (pipeline outputs + basemaps only) |
| Timeline | `components/context-timeline.tsx` + `lib/context-timeline.ts` (drought strip + S2 ticks + playhead), shown under `FarmMap` only when `ContextRasters > 0` | `components/activity-timeline.tsx`: a vertical *list* of management events + observations on the landing page; not a time axis |
| Dedup today | None at request time. Overlapping pulls re-download everything, and `buildContextTimeline` keeps the newest file per product+date at *display* time | n/a |

So most of the work for change 1 is in FDB, and OFE needs the context feature ported. For change 2, both apps get a new axis-style timeline component. OFE keeps its activity list as well.

---

## 1. Spatial Context: Pull → Update / Expand

### 1.1 Concept: coverage

Everything depends on one derived value, the **coverage** per farm and product:

- **Static products** (`POLARIS`, `USGS3DEP_10m`, `SOLUS`; `timeVarying: false` in `lib/geodart.ts`): *covered* or *not covered*. They're covered once any job has returned `product_results[p].ok` for an AOI that contains the current one. Update and Expand never request them again.
- **Time-varying products** (`USDroughtMonitor`, `Sentinel2`): a set of covered date intervals, `[start, coveredThrough]`. It comes from successful jobs whose result for that product was `ok`.
  - `coveredThrough = min(job.end_date, job.submitted_at − publicationLag[p])`. If someone pulls "through today", the last few days may not have been published yet, so the next Update has to request them again. Suggested lags: USDM 9 days (weekly map valid Tuesday, released the following Thursday), Sentinel2 5 days (revisit plus processing). Keep them as constants next to `PRODUCTS`.
  - Merge overlapping or adjacent intervals. Usually there's one interval, but Expand can leave a gap if a job fails.
- **AOI.** Coverage only counts jobs whose stored `aoi` ring contains the farm's *current* AOI (`bboxRing(bounds, buffer)`). If someone has since drawn a field outside the old AOI, existing coverage no longer applies. The card then says "Field boundaries changed since the last pull" and offers a fresh Pull instead of Update/Expand.

Coverage is computed from `Context_Fetch_Jobs` and `Context_Rasters`, which already exist, so it needs no new table. New helper: `lib/context-coverage.ts` → `getContextCoverage(farmId)`:

```ts
interface ContextCoverage {
  aoi: [number, number][] | null;      // AOI of the jobs counted
  aoiChanged: boolean;                 // current geometry is outside that AOI
  bufferM: number;
  products: Record<ProductCode, {
    static: boolean;
    covered: boolean;                  // static: any ok result; time-varying: intervals.length > 0
    intervals: [string, string][];     // time-varying only, YYYY-MM-DD, merged
  }>;
  inFlight: boolean;                   // any pending/submitted/running job (blocks Update/Expand)
}
```

### 1.2 Update

What the user sees: one click, then a small confirmation that lists exactly what will be fetched, e.g.

> Drought Monitor: Oct 28 2026 → Nov 13 2026
> Sentinel-2: Nov 2 2026 → Nov 13 2026
> Soil & terrain: already downloaded, skipped

What the server does, for each time-varying product that has coverage: `start = lastCoveredThrough + 1 day`, `end = today`. A product where `start > today − lag` has nothing new, so it's dropped. If nothing is left, the button is disabled with the tooltip "Up to date". Products that are grouped by identical `(start, end)` go into **one GeoDaRT job per group**. Today that's usually one job, because both products tend to share an end date.

### 1.3 Expand

What the user sees: a dialog with start/end pre-filled from the current covered range. The start can only move earlier and the end can only move later, and `DateInput` min/max enforce that. A live preview shows only the ranges that will be fetched:

> Will fetch: Jan 1 2024 → Dec 31 2024 (before current range)
> Already have: Jan 1 2025 → Nov 4 2026

The same dialog can also **add a product** that has never been pulled, for example Sentinel-2 once a GeoDaRT key exists. A product with no coverage gets the whole new range, and a missing static product gets a single request. A static product that's already covered is shown checked and greyed out with the note "already downloaded".

What the server does: subtract coverage from `[newStart, newEnd]` for each product. That leaves up to two gaps (before and after), plus any gap inside the range left by a failed job. Again it's one job per distinct `(start, end)` group, so a two-sided expand creates two jobs.

### 1.4 Server is the source of truth for dedup

Don't trust date ranges sent by the client. Extend `POST /api/farms/[id]/context`:

```jsonc
{ "mode": "pull" | "update" | "expand",
  "products": [...],            // pull/expand
  "start_date": "...", "end_date": "...",   // pull/expand
  "buffer_m": 150 }             // pull only; update/expand reuse coverage.bufferM + aoi
```

- `mode: "pull"` behaves exactly as today. The route is unchanged for clients that don't send `mode`, so the Python Client and older callers keep working.
- `update` and `expand` call a new `planContextRequests(coverage, mode, args)`. It returns `{product, start, end}[]` groups, and each group goes to `requestContextFetch()`, using the **stored AOI** so new rasters line up exactly with old ones. The response is `{ jobs: ContextJobDTO[], skipped: {product, reason}[] }`. An empty `jobs` returns 200 with "nothing to fetch", not an error.
- A coverage check runs inside the same transaction as job creation (`pg_advisory_xact_lock(farm_id)`), so a double-click or two tabs can't queue the same range twice. Update/Expand are refused while `coverage.inFlight`.
- Add a `GET /api/farms/[id]/context/coverage` route. The card fetches it, and the Expand preview uses the same `planContextRequests()` through `?mode=expand&start=…&end=…` (dry run). The preview and the real request then can't disagree.

**Ingest-side guard (belt and braces):** in `advanceJob()`'s `keep()` callback, skip a time-varying raster if the farm already has a `Context_Rasters` row with the same `product + capture_date` from a job with a containing AOI. The file is deleted, the same way cloudy S2 frames are. This catches the edge where GeoDaRT returns the boundary week either side of the requested range (USDM's weekly valid dates don't fall on our range edges). The cost is a wasted download of a few KB to MB, but no duplicate rows and no duplicate files on disk.

### 1.5 Schema (migration `095_context_job_mode.sql`)

All changes are optional but useful for the job list and for debugging:

```sql
ALTER TABLE pgntarg2udzj1f3."Context_Fetch_Jobs"
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'pull',      -- pull | update | expand
  ADD COLUMN IF NOT EXISTS parent_job_id integer NULL
    REFERENCES pgntarg2udzj1f3."Context_Fetch_Jobs"(id) ON DELETE SET NULL; -- first job of a multi-job request
```

Coverage needs no new columns. Prisma: add the two fields to `ContextFetchJob`. Per the usual rule, the SQL goes to the local DB directly and is **handed to you for prod**.

### 1.6 Card UI (`spatial-context-card.tsx`)

- `coverage == null || nothing covered` → today's button and dialog, unchanged.
- Otherwise the header shows `[Update]` (primary) and `[Expand…]` (outline), plus a `⋯` menu with "Pull spatial context…" (D4) for the rare deliberate re-pull, such as a different buffer. It's hidden in the menu so nobody reaches for it by habit.
- `aoiChanged` → a banner "Field boundaries changed since the last pull" with a Pull button. Update/Expand are disabled.
- A **coverage summary line** goes above the job list, e.g. `Drought Jan 2025 – Nov 2026 · Sentinel-2 Jan 2025 – Nov 2026 · Soil, Terrain ✓`. That's more useful than scrolling through jobs.
- Job rows get a mode badge (Pull / Update / Expand). Show the latest 3 jobs and collapse older ones behind "Show all (n)", because Update will add a job row every season.

### 1.7 Downstream consumers

- `lib/context-timeline.ts` already merges across jobs (newest file wins per product+date), so its output stays correct. The range becomes the union of intervals, and it just gets wider.
- Yield runs (`resendYieldRunsForContextJob`) and the terrain layer (`farm.ContextRasters[0]`) are unaffected, because Update never touches static products.
- `FarmersDatabase/Client/fetch_spatial_context.py` and the file-tree sync read rasters per job. Check that the tree builder doesn't assume one job holds the full range. If it's per-product folders keyed by capture date, nothing changes.

---

## 2. Farm data timeline

### 2.1 Data: one merged timeline payload

Generalise `lib/context-timeline.ts` into `lib/farm-timeline.ts`, which returns:

```ts
interface FarmTimeline {
  start: string; end: string;          // union of context range and event range
  drought: DroughtWeek[];              // unchanged
  imagery: ImageryFrame[];             // unchanged
  events: TimelineEvent[];
}
interface TimelineEvent {
  id: string;                          // "<kind>:<row id>", stable for React keys and map linking
  kind: EventKind;
  at: string;                          // ISO datetime (date-only sources → T12:00Z)
  label: string;                       // "Photo · J. Smith", "Note: aphids on east edge…"
  fieldId?: number | null;
  lat?: number | null; lng?: number | null;   // lets a click fly the map to it
  href?: string;                       // detail page / file
}
```

**FDB event sources** (farm-scoped, using the existing `getEffectiveScope` / `scopeIncludesFarm` check, which the timeline route already does):

| kind | model | date column |
|---|---|---|
| `photo` | `Photo` | `timestamp ?? received_at` |
| `note` | `Note` | `timestamp ?? received_at` |
| `recording` | `Recording` | `start_time ?? received_at` |
| `video` | `Video` | `timestamp ?? received_at` |
| `document` | `Document` | `timestamp ?? uploaded_at` |
| `lab_upload` | `LabMemberUpload` | `date_collected ?? start_time ?? received_at` |
| `form_response` | `FormResponse` | `submitted_at` |
| `drone_flight` | `DroneFlightRecord` (via the farm's experiments) | `flight_date` |
| `sampling` | sampling point collections, if dated | collection time |

| `management` | `Management_Events` (new, synced from OFE, §6) | `event_date` |

Management entries live only in OFE today. §6 adds the OFE → FDB sync that gives FDB its `management` lane.

**OFE event sources:** `ManagementEvent` (`event_date`, icon from `operation-icons.ts`), `Observation` (`observedAt`), `Attachment` / `FdlUpload`, `FormResponse`, `SamplingPointCollection`. OFE's drought/imagery lanes come from FDL (§3).

Performance: event rows are small, but a busy farm can have thousands of photos. The route should return events within `[start, end]` with a hard cap (e.g. 5 000), together with per-kind counts, so the UI can show "+n more" if the cap is hit. Select only the columns needed for the timeline; no blobs.

Visibility rule change: the farm page shows the timeline when **either** context rasters **or** any events exist. Today it's hidden unless `ContextRasters > 0`.

### 2.2 Component: `FarmTimeline` (replaces `ContextTimeline`)

- **Bigger.** It becomes a full-width panel under the map with a collapse/expand toggle (state remembered in `localStorage`). Collapsed (~80 px) it looks like today plus one combined event-dot lane. Expanded (~240–300 px) it shows one **swim lane per kind**: Drought, Imagery, Photos, Notes/Observations, Recordings, Uploads, Forms, Drone, and in OFE Management. Each lane has a small icon label on the left.
- **Zoom and pan.** Range presets (`Season` / `1 yr` / `All`), ctrl/⌘+wheel zoom around the cursor, drag on the axis to pan, and a thin overview "brush" strip under the axis when zoomed in. Month ticks become week or day ticks as the range narrows; `monthTicks()` generalises to `axisTicks(span)`.
- **Density.** Events are bucketed by pixel width, roughly 6 px per bucket. A bucket with more than one event draws one dot sized or labelled with its count. Hovering shows a tooltip listing up to 5 items plus "+n more".
- **Interaction.**
  - The playhead keeps its current meaning: it snaps to imagery dates (else drought weeks) and drives the S2 layer. `value`/`onChange` stay unchanged, so `farm-map.tsx`'s imagery wiring doesn't change.
  - Clicking an event selects it. If it has lat/lng, the map flies there and opens the existing photo/note/lab-upload pin popup (the map already renders these pins, so this is wiring, keyed by `TimelineEvent.id`). If it has none, the click opens `href`.
  - Lane toggles in the legend show and hide lanes. Phase 2 option: "Only show map pins within ±N days of the playhead", which ties the map and the timeline together.
- **Accessibility.** The playhead stays a `role="slider"`. Event dots are buttons with `aria-label`, and arrow keys within a lane step between events.
- No new dependency is needed. The current component is hand-rolled divs with percentage positioning, and that scales fine to a few thousand absolutely positioned dots after bucketing. Avoid pulling in a charting library for this.

### 2.3 OFE's existing Activity Timeline list

Keep it. It's the "what happened recently" feed and it's good at that. Clicking a day heading in the list scrolls the new axis timeline to that date. The two components share the event payload, so the landing page builds it once.

---

## 3. OFE port of Spatial Context

OFE talks to FDL only through the Data Access API with its service bearer token (`lib/fdl-sync.ts` / `fdl-rasters.ts` pattern), and the browser only talks to OFE's own proxy routes.

**New FDL Data API routes (Dashboard-UI `app/api/data/farms/[id]/context/...`):**
- `GET  /api/data/farms/[id]/context`: coverage plus the latest jobs (same DTO as the internal route)
- `POST /api/data/farms/[id]/context`: same `mode` body as §1.4, attributed to the service user
- `GET  /api/data/farms/[id]/context/timeline`: drought + imagery only (OFE merges in its own events)
- `GET  /api/data/farms/[id]/context/rasters/[rasterId]/...`: S2 frame render / terrain, mirroring the routes `farm-map.tsx` uses, so OFE's map can follow the playhead (can be phase 3b)

All of these reuse the internal helpers. The routes are thin wrappers that do service-token auth plus a farm-ownership check, like the existing `/api/data/farms/[id]/rasters`.

**OFE side:**
- `lib/fdl-context.ts`: a fetch wrapper that tolerates older FDL builds. On a 404 it returns `null` and the card hides itself (same convention as the "absent from older FDL builds" comments in `fdl-rasters.ts`).
- Proxy routes `src/app/api/farms/[id]/context/...` authorise the OFE user against the farm (`lib/farm-access.ts`), then forward the request.
- A copy of `SpatialContextCard` and `FarmTimeline` goes under `src/components/` (no shared package between the repos, same as `map-raster-checklist`). Add a header comment pointing at the FDB original.
- Placement: on the landing page "Field Map" section, the timeline sits under the map and the context card sits beside the experiments card. Replace the `fields/[id]/context` ComingSoon page later, or point it at the same components filtered to one field.
- Update the root `CLAUDE.md` line listing which `/api/data/...` routes OFE depends on.

---

## 4. Phasing

| Phase | Scope | Repo(s) |
|---|---|---|
| **1** | `lib/context-coverage.ts` + `planContextRequests()`, `mode` on POST, coverage GET + dry run, ingest-side guard, migration 095 | Dashboard-UI |
| **2** | Card UI: Update / Expand / coverage line / job collapse / AOI-changed banner | Dashboard-UI |
| **3** | `lib/farm-timeline.ts` events + `FarmTimeline` component (lanes, zoom, buckets, map linking); show the timeline whenever events exist | Dashboard-UI |
| **4** | Data API context routes (coverage, POST, timeline) | Dashboard-UI |
| **5** | OFE: `fdl-context.ts`, proxies, card + timeline copies, landing-page placement, management/observation lanes | OFE_Dashboard |
| 5b | OFE imagery-frame proxy so the S2 layer follows the playhead | both |
| **6** | Management event sync OFE → FDB (§6): migration 096, `/api/data/ofe/operation-catalog` + `/management-events` routes, OFE push job, FDB management list + timeline lane | both |

Phase 6 is independent of phases 1–2 and can start alongside phase 3. The FDB timeline simply gains its `management` lane once the table has rows.

Deploy order: FDB to dev (`fdl.casata.org`), then FDB prod (after the migration is handed over and applied), then OFE. OFE is safe to deploy before FDB because of the 404 tolerance.

### Manual verification (no test suite)

On a dev farm:
1. Fresh farm → the card shows "Pull spatial context" as today.
2. Pull 2025 → the card switches to Update/Expand, and the coverage line reads Jan–Dec 2025.
3. Update → GeoDaRT job for 2026-01-01 → today only, with no POLARIS/3DEP. Check `Context_Fetch_Jobs.products/start_date` and confirm `Context_Rasters` has no product+capture_date duplicates (`GROUP BY farm_id, product, capture_date HAVING count(*) > 1` → 0 rows).
4. Update again immediately → disabled, "Up to date".
5. Expand to 2024-06-01 → one job for 2024-06-01 → 2024-12-31 only. Expand both sides → two jobs.
6. Fail an S2 job (bad key) → that interval stays uncovered, and the next Update/Expand re-requests it.
7. Draw a field outside the old AOI → AOI-changed banner.
8. Double-click Update / two tabs → one job.
9. Timeline: events appear in the right lanes. Clicking a photo dot opens its map pin. A farm with photos but no context still shows the timeline. Zoom to a week and get day ticks.

---

## 5. Decisions (settled 2026-11-13)

- **D1. Who can pull, update and expand.**
  - FDB: lab members, meaning anyone who passes `canEdit` (admin and member, not viewer). That's the current gate on `POST /api/farms/[id]/context`, so it stays.
  - OFE: farm owners and agronomists with access to that farm. OFE's proxy routes enforce this through `lib/farm-access.ts` before forwarding to FDB.
- **D2. Management events.** Sync OFE → FDB as a full feature (§6). This is also a step toward eventually consolidating OFE and FDB into a single database.
- **D3. "Update" end date.** Update requests up to `today` and takes whatever GeoDaRT has as of then. Coverage records `today − lag` (USDM 9 d, S2 5 d), so the next Update overlaps the last few days and anything published late still arrives. The ingest-side guard (§1.4) drops the overlap's repeats. Revisit only if GeoDaRT ever reports per-product availability.
- **D4. Labels.**
  - A farm with nothing pulled keeps today's **"Pull spatial context"** button and dialog.
  - The rare deliberate re-pull (different buffer) sits in the `⋯` menu under that same label, "Pull spatial context…".
  - The boundaries-changed banner uses that label as well.
- **D5. Products, implements and crop varieties on synced events.** Sync only what the timeline and management list need. Each event carries a small JSONB snapshot (§6.2). Inventory sync is a future item (§7).

---

## 6. Management event sync (OFE → FDB)

### 6.1 Why and how

Management events (planting, tillage, spraying, harvest… — OFE `ManagementEvent`) are the one big farmer-entered record type that never reaches FDB. Fields, experiments, zones, observations, photos, forms and sampling maps already do. Syncing them gives the lab the management history behind each experiment and the FDB timeline its `management` lane. It also moves toward one database: each FDB table here is shaped as the eventual merged table, not as a separate copy.

**Precedent to copy:** the forms and sampling maps push (`OFE_Dashboard/src/lib/fdl-form-map-sync.ts` ↔ Dashboard-UI `lib/ofe-sync.ts` + `/api/data/ofe/*`, migration 091):
- **OFE owns the record.** It's created and edited only in OFE and is read-only in FDB (`ofeLock()`, 409 on any web edit route).
- **Whole snapshots.** Each record goes over as one snapshot (`PUT …/[ofeId]`), keyed by `ofe_id`. The push job hashes the snapshot and resends when the hash changes, instead of each OFE edit route marking rows dirty.
- **Deletes are reconciled.** Anything FDB lists as OFE-owned that no longer exists in OFE gets a `DELETE`.
- **Service token only.** `withOfeService()` 403s anything but an unrestricted service token.
- **Consent gate.** Only farms that already sync (have an `fdl_farm_id`, i.e. the lab has turned on `ofe_sync_enabled` for that farm) push events. That's the same gate observations already go through, so no new consent decision is needed.

### 6.2 FDB schema: migration `096_ofe_management_events.sql`

Column names follow OFE's (`event_date`, `operation_type_id`, `notes`, `source`…), so a later merge is a straight copy. `ofe_id` is the merge key, and it's nullable so FDB can author events itself later.

| Table | Columns | Notes |
|---|---|---|
| `Operation_Categories` | `id`, `ofe_id` UNIQUE, `name`, `sort_order` | Global catalog, small. Whole-catalog snapshot push |
| `Operation_Types` | `id`, `ofe_id` UNIQUE, `category_id` → Operation_Categories, `name`, `requires_implement`, `requires_seed_or_product`, `sort_order` | Same |
| `Management_Events` | `id`, `ofe_id` UNIQUE NULL, `farm_id` → Farms, `operation_type_id` → Operation_Types, `event_date` DATE, `experiment_id` → Farm_Experiments NULL, `notes`, `source` (`farmer_web`/`lab_member_web`/`api_sync`), `implement` JSONB, `product` JSONB, `crop_variety` JSONB, `created_by_email`, `created_by_name`, `entered_on_behalf_of_email`, `ofe_created_at`, `ofe_updated_at`, `synced_at` | Child-table RLS through Farms (same pattern as `Farm_Layers`). Index `(farm_id, event_date)` |
| `Management_Event_Fields` | `event_id` → Management_Events CASCADE, `field_id` → Fields CASCADE, UNIQUE pair | Mirrors OFE `management_event_fields` |
| `Management_Event_Uploads` | `event_id` → Management_Events CASCADE, `upload_table`, `upload_id`, UNIQUE triple | Points at FDB's own upload rows. OFE's `ManagementEventUpload → FdlUpload` already holds `(fdl_table, fdl_upload_id)`, so it maps 1:1. Same pair shape as `Task_Upload_Links` |

- **Snapshots (D5).** `implement` = `{ofe_id, name, type}`, `product` = `{ofe_id, brand_name, type, extra_fields}`, `crop_variety` = `{ofe_id, name, crop}`. They stay JSONB until OFE inventory is mirrored, and then become FKs.
- **People.** They go over as email + name, not user FKs. OFE users aren't FDB users, and the same email-based resolution as form assignments can link them later.

Prisma: models `OperationCategory`, `OperationType`, `ManagementEvent`, `ManagementEventField`, `ManagementEventUpload` in schema `pgntarg2udzj1f3`. Per the usual rule, run the migration on local dev and **hand the SQL over for prod**.

### 6.3 FDB routes (`app/api/data/ofe/…`, all `withOfeService()`)

- `PUT /api/data/ofe/operation-catalog`: whole catalog snapshot `{categories:[…], types:[…]}`, upserted by `ofe_id`. A type that's no longer listed is kept if events still reference it, and otherwise deleted.
- `PUT /api/data/ofe/management-events/[ofeId]`: the event snapshot, which includes:
  - `fdl_farm_id`, `operation_type_ofe_id`, `event_date`, `fdl_experiment_id?`, `fdl_field_ids[]`, `uploads:[{table,id}]`, the snapshots and the people.
  - FDB checks that the farm, experiment, fields and uploads all belong to that farm. Bad references are dropped and reported back, not 4xx'd, so one stale link can't wedge an event.
  - It returns `{id, dropped:[…]}`.
- `DELETE /api/data/ofe/management-events/[ofeId]`.
- `GET /api/data/ofe/management-events?farm_id=`: `{ofe_id, hash}` list for delete reconciliation and to skip unchanged pushes after an OFE restart.
- `lib/ofe-sync.ts` gains `upsertOfeManagementEvent()` and `upsertOfeOperationCatalog()`, so the routes stay thin.

### 6.4 OFE push (`src/lib/fdl-management-sync.ts`)

- **OFE schema change** (`prisma migrate dev`): `management_events` + `fdl_management_event_id Int?`, `fdl_pushed_hash String?`, `fdl_pushed_at DateTime?`.
- **Order in the sync run** (`fdl-sync.ts` main loop, per farm): fields → zones → experiments → observations → **management events** → upload pull. The catalog push runs once per run, before the farm loop.
- **Snapshot hash.** The hash covers the *resolved* FDB ids. An event pushed while its field or experiment hadn't synced yet goes over without that link, then re-pushes automatically once the link resolves and the hash changes. That's the same trick as form assignments.
- **Uploads.** A linked upload is already an FDB row by construction (`FdlUpload` mirrors FDB), so there's no file transfer.
- **Prompt push.** Fire-and-forget push of the single event from `POST/PUT/DELETE /api/management-events` after the write commits, so FDB sees it within seconds. The periodic run is the safety net.

### 6.5 FDB display

- **Farm page Management list.** A "Management" card or tab: date, operation (category › type), fields, product/implement, notes and attachments, with an "Entered in OFE Dashboard" badge and no edit controls.
- **Experiment page.** The same list filtered by `experiment_id`.
- **Timeline lane** (§2.1): an icon per operation category, reusing OFE's `operation-icons.ts` mapping (copied).
- **Later / optional:**
  - an `AGENT_TABLES` entry for agents, scoped via `farm.lab_id`, with no people columns;
  - `management_events` in Client's file-tree export.

### 6.6 Consolidation notes

What this phase already gets right for a later single database:
- table and column names match OFE's;
- `ofe_id` acts as the stable cross-reference;
- uploads point to FDB rows, not copies.

What's still left for a later phase:
- the JSONB snapshots (D5);
- people as emails rather than a shared user table;
- the operation catalog living in two places. FDB's copy is read-only for now; at consolidation one becomes the source.

### 6.7 Verification

1. Log an event in OFE on a synced farm → row appears in `Management_Events` within one sync run (seconds, with the prompt push). Fields, experiment and attachments resolve.
2. Edit the event in OFE → same FDB row updated, not duplicated (`ofe_id` unique).
3. Delete in OFE → gone in FDB after the next run.
4. Event on a field that hasn't synced → pushes without the field. Once the field syncs, it re-pushes with the field attached.
5. Farm with sync off → nothing pushed.
6. FDB web edit routes don't exist for these rows. Confirm a non-service bearer token gets 403 on `/api/data/ofe/management-events/*`.

---

## 7. Future items (not in this plan)

- **OFE inventory sync** (D5): mirror `Equipment`, `Product`, `CropVariety` and their type tables to FDB, keyed by `ofe_id`. The management events' `implement` / `product` / `crop_variety` JSONB snapshots then become FKs. Needed before any OFE/FDB database consolidation.
- **Shared people table:** synced records carry emails rather than user FKs (§6.6).
- **Field / experiment links on synced observations:** observations already push as Notes, but without their field or experiment ("FDL ask B" in `OFE_Dashboard/src/lib/fdl-sync.ts`). That could reuse §6's link-table approach.
