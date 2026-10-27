# Drone imagery integration — auto-discovery, cross-lab matching, analysis, and multi-surface display

Extends **items 6/7** (`docs/raster-tiling-plan.md` — upload/tiling/display, Phase 1
implemented as of commit `487e664`) to cover the parts that doc explicitly left
out: automatic discovery of orthomosaics landing on Datamachine, matching them
to the right farm (and, once multi-tenancy ships, the right lab), running
analysis that combines a raster with point observations, and displaying results
in OFE Dashboard and eventually the mobile apps.

> **Status:** design only, nothing built. Written assuming
> `docs/lab-data-silo-plan.md` has already shipped to production — see
> **§0 Dependency** before starting implementation.

---

## 0. Dependency: lab-data-silo must ship first

This plan's cross-lab matching step (§2) only makes sense once per-lab RLS
roles and the `runWithLab`/`AsyncLocalStorage` tenant-scoping mechanism
described in `docs/lab-data-silo-plan.md` are live in production — Datamachine
is expected to process imagery for more than one lab, and the matching query
in §2 is a genuine cross-tenant read that needs that plan's role model to be
safe. **Build and test the lab silo first.** Everything below is written in
the "already shipped" tense per the user's instruction, but do not start
implementation until `lab-data-silo-plan.md`'s Phase 6 (second-lab dry run)
has passed.

If this work is ever needed before the silo ships (single-lab production,
`TENANT_ENFORCEMENT=off`), §1 (watchdog) and §4 (tiling optimization) are
independent of tenancy and can be built first; skip straight to a fixed
`farm_id` resolution in place of §2's matching query.

---

## 1. Watchdog (Datamachine / PipelineProcessor)

A new first-party job on PipelineProcessor — not routed through the
LLM-wiring/sandbox machinery (this is our own code, same trust level as
`geo_sanity.py`/`basemap_tiling.py`, not a user-uploaded script):

- Watches the Metashape output folder(s) on Datamachine for new, **stable**
  files. Multi-GB exports write slowly — do not trigger on first sight of the
  filename. Prefer Metashape exporting under a temp name and atomically
  renaming on completion; fall back to a size/mtime-stability poll if that
  isn't controllable.
- On a stable new file: compute the footprint and native GSD directly with
  `rasterio` (bounds reprojected to WGS84, pixel size from the file's own
  transform). Metashape's embedded CRS is generally trustworthy (unlike an
  LLM-wired arbitrary script's output), so this does **not** need
  `geo_sanity.py`'s multi-candidate CRS-guessing — trust the embedded CRS, and
  treat "no embedded CRS" as its own case that routes to the unmatched bucket
  (§2) rather than guessing.
- Needs its own dedup/tracking (a local manifest, or checking the reported
  filename/sha256 against what Dashboard-UI already has) so re-scans don't
  reprocess the same file.
- `POST`s `{ footprint, native_gsd_m, source_path, sha256, bytes }` to
  Dashboard-UI's new `POST /api/basemaps/discovered` — does **not** tile yet.

---

## 2. Cross-lab matching (Dashboard-UI)

`POST /api/basemaps/discovered` is a webhook-style route (service-token/HMAC
authed, same category as the existing CVAT and pipelines webhooks) that runs
in two stages:

**Stage A — cross-lab read, before a lab is known.** Runs the overlap-match
query through a dedicated, narrowly-scoped **SELECT-only, cross-lab**
Postgres role — not `app_platform` (that role's grant is scoped to counts +
form/pipeline *structure* for the platform-admin views; extending it to
geometry data would couple this feature's security posture to however that
view evolves). Instead: a purpose-built role/view exposing only
`Fields(id, lab_id, geometry)` / `Farms(id, lab_id, latitude, longitude)` —
no other columns, no write grants. This is the *only* place in the entire
feature that ever sees more than one lab's rows.

- Compute overlap % of the new footprint against each field's geometry
  (`@turf/intersect` + `@turf/area` — Node-side, since Dashboard-UI already
  parses `Fields.geometry` as plain GeoJSON for the draw map and proximity
  checks; no PostGIS needed at this data volume).
- **≥60% overlap with some field** → confident match: that field's farm (and
  therefore lab) is the target.
- **Some overlap or footprint centroid within a proximity threshold of a
  farm, but below 60%** → ambiguous: candidate farm noted, not auto-assigned.
- **No candidate at all** → unmatched.

**Stage B — everything after, lab-scoped.** Once a farm is picked (confident
or, later, confirmed by a human), the endpoint switches to
`runWithLab(matchedSlug, ...)` for every subsequent read/write — creating the
`Basemaps` row, triggering tiling, all of it. The cross-lab role touches
exactly one SELECT in this one code path; nothing else in this feature needs
elevated access.

- **Confident match:** `Basemaps` row created directly in the matched lab
  (`farm_id` set, `match_status: "auto_matched"`), tiling triggered
  immediately (§4) via the existing `POST /basemaps/{id}/tile` call —
  unchanged from the current implementation.
- **Ambiguous match:** `Basemaps` row created in the matched lab with
  `match_status: "needs_confirmation"`, `candidate_farm_id`, `overlap_pct`;
  **not** tiled yet. Surfaced on that farm's Overview tab by reusing the
  "Register" list UI already built for the intake path in
  `components/basemap-upload.tsx` — same component, auto-populated instead of
  requiring someone to browse a folder. Confirming triggers tiling the same
  way an auto-match does. Deferring tiling until a farm is confirmed avoids
  spending Datamachine compute tiling a multi-GB pyramid for something that
  turns out unmatched or gets reassigned.
- **No candidate:** row has no `farm_id`/lab yet — held in a lab-agnostic
  "unmatched imagery" list (a small new page, or folded into an existing
  admin-ish view) until someone manually assigns it, at which point the
  ordinary manual basemap-registration path (already built, §5 of
  `raster-tiling-plan.md`) takes over.

**Processor's own service-account token doesn't change.** Under the silo
plan, `pipeline-processor@service.local` carries a `lab_id` like every other
service account, but that only constrains calls scoped to an
*already-known* record — the existing "webhook resolves the record's lab,
then acts through that lab's client" pattern already covers the tiling
trigger and callback. Only the brand-new Stage-A matching read needs new
access, and it lives entirely on the Dashboard-UI side.

---

## 3. Analysis: combining a raster with point observations

The generic pipelines feature (item 90) already does the hard part — LLM-wired
user scripts, sandboxed execution on Datamachine, CRS-sanity-checked outputs
landing in `Pipeline_Output_Rasters`, which already displays through the same
farm-map/sampling-map layer code as basemaps. The one missing piece: pipelines
today take a single input (`input_file_url`, or a zip), matched by upload
table/category — nothing bundles a raster together with point observations
for the same experiment.

- New pipeline `target_kind: "basemap_analysis"`. **Manually triggered**, not
  auto-fired on every matching upload like ordinary pipelines — these
  analyses want a human picking the right experiment/date range, not a blind
  match rule.
- Trigger UX lives on a `Basemap`'s detail view: "Run analysis" → pick a
  pipeline (from the lab's own registered `basemap_analysis`-tagged
  pipelines, same "lab member owns their own scripts" philosophy as ordinary
  item-90 pipelines) → pick the experiment/data source to pull point
  observations from.
- Dashboard-UI packages a zip (the ortho COG + the point observations as
  GeoJSON/CSV) the same way `_download_sample()` already extracts zip inputs
  for drone-flight pipelines — no new PipelineProcessor primitives needed,
  just a new packaging step upstream of the existing `input_file_url` flow.
- **Point-observation source stays generic on purpose.** "Points from a map
  survey" (`Sampling_Maps`/`Sampling_Points`, already geometry-bearing today)
  and "point observations from the planned observation-to-metric workflow"
  (not yet in `Planned Changes.md` under that name — a forward dependency,
  not yet scoped) should both satisfy the same interface: any
  geometry-bearing point dataset associated with the matched farm/experiment.
  Don't hardcode the bundling step to `Sampling_Maps` specifically.
- Output rasters (crop-damage severity, weed density, height maps, …) land in
  the existing `Pipeline_Output_Rasters` and need **no new display code** —
  they already render via `map-raster-layers.tsx` alongside basemaps.
- **Future UX (not v1):** once a farm has both a `needs_confirmation`-or-later
  basemap and matching point data, surface a "run analysis" suggestion
  directly rather than requiring the lab member to notice and click. Build
  this after the manual flow above is proven — it's UX on top of a mechanism
  that has to exist first.

---

## 4. Tiling: fast, small, ~90% of native resolution

Total pyramid size/render-time is dominated by the **deepest zoom level**
(each level down is ~4x the tile count/bytes of the one above it — a
geometric series dominated by its last term). The current implementation
(`DEFAULT_MAX_ZOOM_CAP = 20`, zoom auto-detected from native resolution) is
likely overshooting by rounding up to the first zoom level that's ≥ native
resolution, paying the full 4x cost of a level for detail a Metashape ortho
usually doesn't actually resolve anyway (reconstruction/blend softening makes
effective sharpness coarser than nominal GSD).

- **Compute native GSD directly** from the source file's transform
  (`rasterio`, already needed for §1's footprint calc).
- **Pick `max_zoom` as the shallowest zoom level whose ground resolution is ≤
  `native_gsd / 0.9`**, not the first level that fully covers native
  resolution. Web Mercator resolution halves per zoom level, so this one
  change is usually the difference between "one level too deep" and the
  right one.
- Replace the flat `DEFAULT_MAX_ZOOM_CAP = 20` with this per-image
  calculation; keep a hard ceiling (e.g. still 20–22) only as a backstop
  against pathological inputs.
- **Switch tile format from PNG to WebP** for the display pyramid. This is a
  visual basemap, not the pixel-accurate copy (the source COG stays that, per
  the existing `Context_Rasters`/`Pipeline_Output_Rasters` "COG is ground
  truth, tiles are for viewing" precedent) — WebP is typically 3–5x smaller
  than PNG for this kind of imagery with no perceptible display loss.
- **Serve from a single MBTiles (SQLite) file instead of a zip of loose
  `{z}/{x}/{y}.png` files.** This also collapses two currently-separate
  formats into one: `raster-tiling-plan.md` §3.3 already plans MBTiles as the
  *mobile* download format — make it the *only* tiling output, and have
  Dashboard-UI's `GET /api/basemaps/[id]/tiles/[z]/[x]/[y]` route read from
  the same MBTiles file rather than a directory of extracted PNGs. One
  tiling pass, one artifact, both consumers.
- **Parallelize tile rendering** (thread/process pool over `(z, x, y)`) at
  the top 1–2 zoom levels specifically, since that's where the bulk of the
  render work lives — `rio-tiler`'s `Reader` already benefits from the COG's
  own overviews for shallower levels, so parallelism only pays off where the
  deep levels dominate.

**Validate against the real pipeline, not QGIS.** A QGIS "Generate XYZ Tiles
(MBTiles)" export was used as an early sanity check and produced a package
smaller than the source TIFF (expected — mostly per-tile compression + a
small AOI bounding total tile count, not evidence the zoom-cap lever is free
at any scale) but visibly low resolution even at z23 (**not** expected — z23
is ~1.4–1.9cm/px, at or beyond most ag-drone native GSD). Root cause is most
likely QGIS's tile export rendering through its map-canvas/display pipeline
(subject to layer resampling settings and the tool's own DPI parameter)
rather than resampling raw source pixels the way `rio-tiler`/`gdal2tiles.py`
do — not a flaw in the zoom-level math. Before trusting any size/resolution
number, run one real orthomosaic through the actual intended path
(`rio-cogeo` → `rio-tiler`) rather than continuing to tune QGIS's export
settings.

---

## 5. OFE Dashboard display

OFE Dashboard currently has **no raster capability** at all — its own
`CLAUDE.md` notes the sampling-map editor deliberately has "no raster-basemap
toolset (no PipelineProcessor-equivalent tiling pipeline here)." It has its
own, entirely separate Postgres and reaches FDL only via the Data Access API
service-account token (`lib/fdl-sync.ts`).

- Don't duplicate raster storage into OFE's own database. Add a read-only
  raster-listing route to the Data Access API (`GET /api/data/farms/[id]/rasters`
  or similar), same shape as the existing `fields`/`farms`/`zones` sync
  routes, returning basemap + pipeline-output raster metadata.
- Proxy tile requests **server-side** through OFE Dashboard's own API using
  its existing service token, mirroring the precedent it already has for
  media: `GET /api/media/[table]/[id]` already resolves an `FdlUpload.id` to
  FDL-hosted content through a proxy route rather than exposing FDL's own
  auth to the browser. A new `GET /api/media/tiles/[basemapId]/[z]/[x]/[y]`
  following the same pattern keeps FDL's tile-serving auth entirely internal.

---

## 6. Mobile base layers

Already correctly scoped as Phase 2 in `raster-tiling-plan.md` (§3.3, MBTiles
packaging + per-platform display — Kotlin via `maps-compose`'s
`TileProvider`, Swift needing an `MKMapView`/`UIViewRepresentable` bridge
since SwiftUI's native `Map` has no raster-tile-overlay API). Nothing in this
plan changes that scoping. Sequence it last — it's genuinely the most
per-platform-costly piece and the least central to the analysis workflow
that motivated this plan. The MBTiles consolidation in §4 means the same
tiling output this plan produces for Dashboard/OFE display is already the
right artifact for the mobile download path too, once that phase is built.

---

## 7. Build order

Reorders the "discovery → match → analyze" framing above into what's actually
buildable first — the automation (§1/§2) depends on capabilities that don't
exist yet, while the analysis mechanism (§3) is the one genuinely new, hard
piece:

1. **Prerequisite:** `lab-data-silo-plan.md` ships to production (§0).
2. Finish proving out plain Basemap upload → tile → display end-to-end (still
   not fully tested per `raster-tiling-plan.md`'s session log) — this is the
   foundation everything else sits on.
3. Apply the tiling optimizations in §4 (zoom-selection formula, WebP,
   MBTiles consolidation) — independent of everything else, validate against
   a real file, not QGIS.
4. Build §3's analysis mechanism (`basemap_analysis` target_kind, raster+points
   zip bundling) as a **manual** "pick basemap, pick data, run" flow.
5. Build §1's watchdog and §2's auto-match/confirm/unmatched states — by this
   point, manual registration is a well-worn path, so this is mostly
   automating something already proven to work.
6. §5 OFE Dashboard proxy display.
7. §6 mobile base layers, last.

---

## 8. Open questions

1. **Proximity threshold for §2's "ambiguous" bucket** — a concrete distance
   (footprint centroid to farm centroid?) hasn't been picked yet.
2. **Where the new cross-lab SELECT-only role's grant lives** — a bare
   `GRANT SELECT` on two tables' specific columns, or a dedicated Postgres
   `VIEW` exposing only `id, lab_id, geometry`? The view is slightly more
   work but makes the blast radius self-documenting.
3. **"Unmatched imagery" landing page** — new small page, or folded into an
   existing admin/pipelines-adjacent view? Not designed yet.
4. **Observation-to-metric workflow's actual shape** — §3 deliberately treats
   this as an unscoped forward dependency; revisit the "generic point-source
   interface" assumption once that workflow is actually designed.
