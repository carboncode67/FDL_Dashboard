# Large raster upload, tiling & display — scoping doc (items 6 & 7)

Covers **item 6** ("Add large raster upload and tiling capabilities to FDB...")
and **item 7** ("Add raster display capabilities to FDL maps and to be sent to
FDL app") in `FarmersDatabase/Planned Changes.md`, including item 6's two
sub-bullets (drone-raster checkbox on Farm maps; raster basemap toolset in the
Create-maps/sampling-map editor).

> **Status:** Phase 1 (Dashboard-UI + PipelineProcessor upload/tiling/display,
> not yet the mobile apps) implemented as of commit `487e664` (2026-09-13) —
> `Basemaps` table (migration 074), `POST /api/basemaps`, tiling webhook,
> farm-map + sampling-map-editor display. Being tested live against TrueNAS
> dev as of 2026-09-15 — see the session log at the bottom for what's been
> found and fixed so far, and what's still open. This header is stale
> relative to the rest of the doc below (§§2-5 predate implementation and
> haven't been reconciled with what actually got built) — treat the log as
> the current source of truth, the rest as historical scoping context.

---

## 1. Goal

| Requirement | Source |
|---|---|
| A robust upload path for large rasters (drone orthomosaics — realistically hundreds of MB to several GB) | item 6 |
| A built-in tiling pipeline so an uploaded raster is viewable without shipping the whole file to a browser or phone | item 6 |
| Farm map: checkbox to overlay rasters spatially associated with that farm (inside field bounds) | item 6.1 |
| Sampling-map editor (Create maps): a raster-basemap toolset with a **positive** buffer (extend beyond field boundary) and a max-resolution/zoom-level control for what gets sent to the phone | item 6.2 |
| FDL mobile apps (Swift + Kotlin): can display a raster layer on their maps | item 7 |

Non-goal for this pass: this doc does not re-scope the drone-flight
auto-processing pipeline (item 90 Phase 2 — landing folder → zraid1 →
`PipelineOutputRaster`, see `PipelineProcessor/CLAUDE.md`). That pipeline is
one *source* of rasters this feature needs to display; it already exists
(pending the zraid1 mount — see `pipelineprocessor-deployed-datamachine`
memory) and isn't being redesigned here.

---

## 2. What already exists (the ingredients)

This isn't greenfield — several pieces line up almost exactly with what items
6/7 ask for:

- **Raster rendering already works client-side**, just not tiled.
  `components/map-raster-layers.tsx`'s `RasterLayer` fetches a whole GeoTIFF,
  parses it in-browser with `georaster`/`georaster-layer-for-leaflet`, and
  drops it on the Leaflet map — its own comment already flags this as
  "fine for lab-scale pipeline outputs; a large raster would want geotiff.js's
  own tile reader instead." That's exactly the gap item 6 names.
- **A raster storage/display precedent exists twice over**: `Context_Rasters`
  (GeoDaRT pulls) and `Pipeline_Output_Rasters` (item 90 pipeline outputs) both
  store `filename`/`bytes`/`sha256` and are served as flat files off `DATA_DIR`
  via range-request-capable routes (`/api/files/context/[filename]`,
  presumably the same for pipeline outputs). Any new raster upload path should
  follow this exact shape, not invent a new one.
- **`Context_Rasters.footprint`** (`Json`, "GeoJSON Polygon of the requested
  AOI bbox") is the precedent for the spatial-lookup column item 6.1 needs —
  `Pipeline_Output_Rasters` deliberately has *no* footprint column today
  (bounds come from the file's own embedded georeferencing at render time),
  which works for "show this one raster" but not for "which rasters intersect
  this field" queries at scale.
- **COG is already this repo's standing raster convention.** GeoDaRT returns
  `export_format: "COG"` for context pulls, and the Dashboard-UI CLAUDE.md
  already notes "COGs are directly usable by a web map / tiler / `rio-tiler`."
  Whatever the new tiling step produces, COG-in / COG-or-tiles-out keeps this
  consistent.
- **GDAL-backed raster tooling already lives on Datamachine.**
  `PipelineProcessor`'s host `requirements.txt` and its
  `fdl-pipeline-standard` sandbox image both ship `rasterio`/`pyproj`
  (`geo_sanity.py` already does CRS reprojection there). A tiling step doesn't
  need new infrastructure — it needs a new script/entry point on a machine
  that already has the right libraries and is already the "compute machine"
  in this architecture's division of labor (Dashboard-UI is explicitly meant
  to never run scripts or touch Docker itself).
- **Drone imagery already has a landing path.** `DroneFlightRecord` already
  has `total_images`, `needs_ortho`, `needs_3d`, `data_storage_path`,
  `tile_coverage_pct`, `tile_size_m` — fields clearly anticipating exactly
  this feature. The item-90 Phase 2 drone-flight pipeline (raw imagery dropped
  in `LANDING_DIR` on Datamachine → sandbox run → output copied to zraid1 →
  `output_storage_path` reported back) is one legitimate *producer* of a
  large orthomosaic raster; a direct "upload an already-built raster" path
  (e.g. something processed in Agisoft Metashape on Datamachine outside the
  auto-pipeline) is another. Item 6 should serve both.
- **Mobile "download for offline use" pattern already exists** for sampling
  maps (`SamplingMapsService.downloadSamplingMap` in Swift; the Kotlin
  counterpart per its CLAUDE.md). Sending a raster to the phone app is a
  variant of a pattern the apps already implement, not a new concept for them.
- **Mobile map frameworks differ in raster-tile support**, which changes the
  cost of item 7 per platform:
  - **Kotlin** uses Google Maps Compose (`maps-compose`), decided 2026-09-08 —
    it has first-class `TileOverlay`/`TileProvider` support for exactly this.
  - **Swift** uses SwiftUI's native `Map`/`MapReader` (iOS 17+ MapKit), which
    has **no first-class raster-tile-overlay API** in the SwiftUI layer —
    `MKTileOverlay` is a UIKit `MKMapView` concept. Getting a raster layer
    into the existing SwiftUI `Map` will likely need a `UIViewRepresentable`
    bridge to `MKMapView` (scoped to when a raster layer is active), or
    another approach — this is a real per-platform cost difference worth
    flagging now, not discovering mid-implementation.

---

## 3. Architecture decisions (recommended, open to revision)

### 3.1 Where tiling compute runs — **recommend PipelineProcessor / Datamachine**

Dashboard-UI's own stated architecture principle is that it never runs
scripts or touches Docker — that's PipelineProcessor's job, on its own
dedicated machine. Datamachine already has `rasterio`/GDAL wheels installed
and is already the place drone imagery physically lands. Recommendation:
tiling is a new capability on PipelineProcessor (a plain function/route, not
necessarily routed through the LLM-wiring pipeline machinery that's built for
arbitrary user scripts — this is a first-party operation, not a user-uploaded
one), rather than adding GDAL to the Dashboard-UI container or standing up a
third service.

### 3.2 Tile serving — **recommend static pre-generated tiles, not a live tile server**

Two options:
- **(a) Dynamic tiler** (e.g. `titiler`/`rio-tiler` serving tiles on demand
  straight from the COG) — more flexible (any zoom on demand, no
  pre-generation wait), but it's a new always-on service, a new deploy
  target, and a new thing to keep alive on a ~5–15-user lab deployment.
- **(b) Static pre-generated tile pyramid**, produced once per raster on
  Datamachine (e.g. `rio-tiler`'s or GDAL's tiling helpers writing a fixed
  zoom range to a flat directory or a single MBTiles file), then shipped to
  `DATA_DIR` and served the same way every other upload type already is
  (flat file + range requests / static serving, no new service).

**(b)** matches this codebase's consistent pattern (photos, recordings,
context rasters, pipeline outputs are all flat files behind a thin serving
route) and needs no new infrastructure, health checks, or another moving part
on the lab server. Recommend (b): compute tiles once on Datamachine as part
of the same step that currently does CRS normalization, ship the tile set
(or an MBTiles file) alongside the source COG the way `Pipeline_Output_Rasters`
already ships files. A dynamic tiler stays an option to revisit if per-request
flexibility (arbitrary zoom, arbitrary styling) becomes a real need later.

### 3.3 Mobile tile packaging — **recommend MBTiles**

For item 6.2 / item 7's "sent to FDL app" requirement: an **MBTiles** file
(single SQLite file containing a tile pyramid, bounded by the buffer + max
resolution the lab member picks in the editor) is the standard format for
exactly this offline-raster-on-mobile use case — one file to transfer,
trivial to bundle with the existing sampling-map download, and:
- **Kotlin**: `maps-compose`'s `TileProvider` can read straight from an
  MBTiles file (or a small local HTTP/tile-reader shim over it).
- **Swift**: no native MBTiles reader in MapKit, but reading an MBTiles
  SQLite file and answering `MKTileOverlay` z/x/y requests from it is a
  well-trodden pattern — same `UIViewRepresentable` bridge noted in §2 would
  host this.

A loose directory of tile files is easier to *generate* but much harder to
transfer as one blob to a phone and to manage on-device (cleanup, dedup across
downloads) — recommend MBTiles unless a concrete reason surfaces not to.

### 3.4 Data model — new table vs. reusing `Pipeline_Output_Rasters`

Item 6's "large raster upload" (a lab member directly uploading an
already-built orthomosaic — the Agisoft-on-Datamachine case, or any
externally-sourced GeoTIFF) is **not** always a pipeline output, so it
shouldn't be forced into `Pipeline_Output_Rasters` (which has a required
`pipeline_run_id`). Recommend a new table — call it `Drone_Rasters` or
`Farm_Rasters` — shaped like the existing three raster tables
(`filename`/`original_filename`/`bytes`/`sha256`/`crs_status`/`crs_epsg`) plus:
- `footprint Json` (same shape as `Context_Rasters.footprint`) — needed for
  item 6.1's "spatially associated, inside field bounds" checkbox query,
  computed once at tiling time (Datamachine already has the file open with
  `rasterio` to tile it — reading bounds there is nearly free) rather than
  requiring the browser to fetch a whole file just to know if it should ask
  to render it.
- `tile_path` / `tile_url` (or an MBTiles filename) alongside the source COG.
- optional `drone_flight_record_id` FK (nullable) to link back to a
  `DroneFlightRecord` when the raster came from that flow, matching how
  `Pipeline_Output_Rasters.farm_id` links pipeline output back to a farm.
- `farm_id` (required, like both existing raster tables) — this is what
  item 6.1's farm-map checkbox and item 6.2's sampling-map buffer both key
  off.

### 3.5 Upload path itself

The mobile upload routes already stream large files to disk with `busboy`
specifically to avoid buffering in the Node heap (`export const runtime =
"nodejs"`, documented in Dashboard-UI CLAUDE.md as load-bearing for the DO
droplet's 512 MB limit — not applicable to the raster upload's actual host,
but the same pattern is right regardless: never buffer a multi-GB file in
memory). A new `/api/upload/raster` (or under the existing raster-table's own
route) should follow the recording route's `busboy` streaming pattern, not
`request.formData()`. Two things to check before implementation, not yet
verified in this pass:
- Whatever reverse proxy sits in front on both TrueNAS dev and the lab server
  (Nginx Proxy Manager, per the login-rate-limit section of Dashboard-UI
  CLAUDE.md) needs a large enough `client_max_body_size` — nginx defaults to
  1 MB, which would reject a multi-GB upload long before it reaches Next.js.
- Confirm `DATA_DIR` in production is actually the ZFS tank
  (`/mnt/tank/backups/fdl_dashboard`, 17 TB per root CLAUDE.md) and not some
  smaller bind mount — large rasters landing on the wrong volume could fill a
  small disk fast.

---

## 4. Rough shape per component

- **Dashboard-UI**: new `Drone_Rasters` (or similar) table + migration;
  streaming upload route; a small "request tiling" call to PipelineProcessor
  after upload lands (async, callback-style like the existing pipeline
  webhook — reuse the `X-Signature-256` HMAC convention already used by both
  the CVAT and pipeline webhooks rather than inventing a third auth scheme);
  farm-map checkbox + spatial query using the new `footprint` column; new
  raster-basemap toolset in `sampling-map-editor.tsx` (positive buffer input,
  next to the existing negative-buffer point-generation toolset; a max-zoom
  selector) that triggers "clip + tile for mobile" rather than "tile the
  whole raster."
- **PipelineProcessor**: new tiling entry point — given a COG (or a file to
  COG-ify first), produce a tile pyramid / MBTiles at a given max zoom and
  report back bounds (footprint) + tile file location, following the same
  host-side, outside-the-sandbox pattern `geo_sanity.py` and
  `_copy_outputs_to_zraid1()` already use (this is first-party code, not a
  user-uploaded script, so it doesn't need the sandbox's isolation).
- **Swift**: raster-overlay support on `SamplingMapDetailView`'s map — most
  likely a `UIViewRepresentable`-bridged `MKMapView` + `MKTileOverlay` reading
  from a downloaded MBTiles file, scoped to when a sampling map has an
  attached raster basemap.
- **Kotlin**: raster-overlay support via `maps-compose`'s `TileOverlay` /
  `TileProvider`, same MBTiles source — lower-cost side of this feature given
  the framework choice.

---

## 5. Open questions for the user

1. **New table naming** — `Drone_Rasters` vs `Farm_Rasters` vs folding into a
   generalized rename of `Pipeline_Output_Rasters`? (Leaning `Farm_Rasters`
   since not every large raster will be drone-sourced.)
2. **Phasing** — build the whole thing (upload → tiling → farm-map checkbox
   → sampling-map basemap toolset → both mobile apps) as one pass, or land
   Dashboard-UI's upload+tiling+farm-map-checkbox first (useful on its own)
   and treat the sampling-map basemap toolset + both mobile apps as a
   follow-up phase, similar to how item 90 got split into Phase 1/Phase 2?
3. **Static tiles vs. dynamic tiler (§3.2)** — confirm the static/MBTiles
   recommendation, or is there a reason (e.g. wanting arbitrary zoom without
   re-tiling, or serving very large rasters where full pre-tiling is too
   slow/expensive) to prefer a live tiler after all?
4. Any existing drone orthomosaics/rasters sitting around already (from
   Agisoft runs on Datamachine) that should inform real-world size/format
   assumptions before the upload endpoint's limits are set?

---

## 6. Session log — live testing against TrueNAS dev

**2026-09-15 — first real end-to-end test, found and fixed two bugs before
a successful upload:**

- Test file: a real 6.3 GB drone orthomosaic (`orthomosaic_rgb.tif`),
  farm 7 ("Rich Nan Farms", `lab_id=1`/`fdl`).
- **Bug 1 (security): `Basemaps` had no RLS policy.** Migration 074 landed
  the table in `pgntarg2udzj1f3` after migrations 070/071 already ran, so it
  never got the `tenant_isolation` policy every other table there has — and
  `sql/roles/create_lab_role.sql.template`'s `ALTER DEFAULT PRIVILEGES`
  already grants every `app_<slug>` role full CRUD on any new table in that
  schema regardless. Under TrueNAS's live `TENANT_ENFORCEMENT=hard`, that
  meant every lab could read/write every other lab's uploaded basemaps.
  Fixed by `migrations/075_basemaps_rls.sql` (same child-table-via-`farm_id`
  pattern as every other farm-scoped table in 071) — applied and verified on
  local dev and TrueNAS both before proceeding.
- TrueNAS's running app image predated the whole raster-tiling feature
  (last rebuilt 2026-09-11/12, this feature landed 2026-09-13) — rebuilt and
  pushed a fresh image. **Deliberately not pushed to `:latest`** — TrueNAS
  and production share that tag, and per the user's standing rule (no
  production changes until things are proven smooth on dev), a separate
  `ghcr.io/carboncode67/fdl-server:truenas-dev` tag was used instead so
  TrueNAS can keep iterating without any risk of production picking up
  in-flight work on its next pull. Worth deciding at some point whether this
  becomes the permanent convention (TrueNAS always on a distinct tag) or
  stays a one-off for this test — currently the latter.
- **Bug 2: upload failed with a client-side "network error" on the real 6.3
  GB file.** Diagnosed via TrueNAS app container logs (DevTools' Network tab
  couldn't render the huge request), not guessing from the client side:
  `Error: aborted { code: 'ECONNRESET' }`, confirming the request *did*
  reach the app (ruling out a reverse-proxy rejection) and was aborted
  server-side after some real elapsed time. Root cause: `POST /api/basemaps`
  had `export const maxDuration = 300` — Next.js enforces `maxDuration` as a
  real request timeout on self-hosted deployments too, not just Vercel, and
  300s isn't enough for a multi-GB transfer. Bumped to 3600s, confirmed via
  the same rebuild/push/pull/redeploy cycle.
- Also discovered while debugging: TrueNAS dev's actual reverse-proxy stack
  is **Caddy + Unbound on an OPNsense router**, not the Nginx Proxy
  Manager / Cloudflare setup `CLAUDE.md`'s login-rate-limit section
  describes — that doc note has been corrected; what fronts *production* is
  still unverified, don't assume it's the same as what the doc said either.
- **Not yet confirmed: a full successful upload + tiling run.** The
  `maxDuration` fix is pushed and pulled but not yet re-tested end-to-end as
  of this log entry — next step is retrying the same 6.3 GB file and
  confirming `tiling_status` actually reaches `ready` (requires
  `PROCESSING_URL`/`PROCESSING_API_KEY` to be configured on this Dashboard-UI
  instance and PipelineProcessor reachable from it — neither has been
  confirmed live on TrueNAS yet, separately from the upload bug itself).
- Real user feedback captured for follow-up, not yet built:
  1. The real, durable fix for "large upload dies somewhere in the request
     path" is a presigned direct-to-storage upload (S3-compatible, e.g.
     Garage) that bypasses this request's lifecycle entirely rather than
     raising timeouts/limits piecemeal — flagged as a proper follow-up
     scoping item, not a quick patch.
  2. UI polish: "Upload Field Boundaries" and "Upload Basemap" should merge
     into one control that distinguishes by file format, rather than two
     separate upload boxes on the farm page. **Still not built** as of the
     entry below.

**2026-09-15 (cont.) — maxDuration bump didn't fix it; built the sideload
path (option A) instead of chasing the timeout further:**

- Retried the same 6.3 GB file against the redeployed `truenas-dev` image
  (`maxDuration = 3600`): **still `ECONNRESET`**. Confirms the bottleneck is
  not Next.js's own request timeout — it's somewhere further down the chain
  (Caddy, OPNsense, or a router-level NAT/connection-tracking timeout).
  **Root cause still not actually identified** — don't assume it's fixed or
  well-understood, just routed around.
- User weighed two options: (A) a sideload path — drop the file directly on
  a share the server already mounts, register it without re-sending its
  bytes over HTTP — vs. (B) real S3-compatible object storage with presigned
  direct-to-storage uploads. Went with **A**, on the reasoning that basemap
  upload is a low-frequency, lab-member-only action, so standing up new
  storage infrastructure (Garage, bucket/key provisioning, a presigned-URL
  flow, changing how PipelineProcessor fetches the source file) isn't
  proportionate yet. B remains the architecturally "correct" fix if large
  uploads become a recurring pattern across the platform — revisit then,
  don't build it preemptively.
- **Built**: `GET/POST /api/basemaps/intake` + a "Register" list in
  `components/basemap-upload.tsx`. Lists `.tif`/`.tiff` files sitting in
  `BASEMAP_INTAKE_DIR` (new optional env var) not yet registered, and on
  registration: hashes the file where it already sits (streamed, not
  buffered), **symlinks** it into `DATA_DIR/basemap-sources/` (never
  copies — not worth duplicating a multi-GB file), creates the `Basemaps`
  row, and triggers tiling exactly like the existing upload path. No
  migration needed — reuses the same `Basemaps` columns.
- **Important unresolved risk, flagged in the code, not yet tested**: tiling
  still hands PipelineProcessor a `download_url` it fetches over HTTP — the
  *same* Caddy/OPNsense path that just failed for the browser upload.
  Sideloading only fixes the upload half. Deliberately did **not** also add
  a filesystem-path option to `PipelineProcessor`'s tiling endpoint (that's
  a cross-component change, and item-90's `LANDING_DIR`-based pipeline is
  the existing precedent for how that would look) — reasoning: a
  server-to-server fetch between Datamachine and TrueNAS might behave
  completely differently than a browser-initiated upload (different
  network path, no browser-side quirks), so it's worth finding out
  empirically on the next real tiling run before assuming it needs the same
  fix. **If it does hit the same wall, the next step is a filesystem-path
  option on PipelineProcessor's side, not another workaround here.**
- **Not yet done:** actually registering the 6.3 GB test file through the
  new route and confirming a tiling run completes end-to-end. The intake
  directory itself (`/mnt/Inground/Pictures/Drone_Photos/Orthos` on the
  user's NAS) also still needs to be mounted into the TrueNAS app's storage
  config and `BASEMAP_INTAKE_DIR` set to wherever it lands in the
  container — neither done as of this entry, since the SCALE app wasn't
  redeployed with this code yet.
- Committed but **not deployed** anywhere (TrueNAS or production) — per the
  user's standing rule, no production changes until things are proven
  smooth on dev first.
