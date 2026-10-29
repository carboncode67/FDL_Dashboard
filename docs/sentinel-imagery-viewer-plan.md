# Sentinel-2 imagery viewer on the farm-map timeline — scoping

Status: **scoping, Phase 0 done** (2026-10-28). Nothing is implemented yet.

## Phase 0 results (test pull, farm 18 "James Darling", 2025-06-01 → 06-15, ≤ 60% scene cloud)

These supersede anything below that disagrees.

- Job took a few minutes. **2 dates** came back (06-03, 06-08): a 21 MB zip, ~11 MB per file. The AOI is ~6 × 10 km → 714 × 883 px at ~10 m (0.0000992°), tiled GeoTIFF, no overviews. Uncompressed in memory that's ~40 MB per date for all 16 bands, so **read only the bands needed** (`readRasters({samples})`), never the whole stack.
- Zip path: `Sentinel2/S2MPC_<uuid>/aoi_001/Sentinel2_<date>_<4hex>.tif`; `captureDateFromName` parses it fine.
- **16 bands, not 21:** `B01 B02 B03 B04 B05 B06 B07 B08 B8A B09 B11 B12 AOT WVP SCL NDVI` (indices 0–15). **No `TCI_*`, no `MSK_CLDPRB`.** geotiff.js `getGDALMetadata(i).DESCRIPTION` returns these names, so look bands up by name.
- **GeoDaRT's NDVI band is wrong — don't use it.** Reflectance DNs carry ESA's +1000 offset (processing baseline 04.00, every scene since 2022-01-25), and GeoDaRT computes NDVI from the raw DNs. On the clear date, mean NDVI over vegetation pixels (SCL 4) is **0.55 from GeoDaRT vs 0.79 corrected**. The Dashboard computes NDVI itself: `refl = (DN − 1000) / 10000` for captures on or after 2022-01-25, `DN / 10000` before. The same applies to the true-colour stretch.
- **SCL works as a cloud mask.** 06-03 is 99.7% class 4 (vegetation), so clear. 06-08 is 12.6% shadow (3) + 17.1% / 31.7% cloud (8/9) + 15.2% cirrus (10), only ~23% clear, so it's correctly "cloudy" under the 80% rule. Cloud masking is SCL-only (no probability band).
- `_b0af` in the filename confirms the product-token risk under "Risks": `_b0` matched on a 4-hex suffix.
- Per-farm volume: ~11 MB per date for a ~6 × 10 km AOI. At ≤ 60% scene cloud, ~2 dates per 2 weeks → roughly 50 dates (~0.5 GB) per growing season for a farm this size.

Goal: once a farm has Sentinel-2 pulls, the timeline under the farm map (the one that shows the US Drought Monitor strip today) lets you scrub through the imagery dates. The map shows the selected date as true colour or NDVI, and the timeline shows an NDVI time series.

## What already exists

| Piece | State |
|---|---|
| GeoDaRT Sentinel-2 | Works without a real key: `user_password_hash` is a required field but nothing checks it (`GEODART_PASSWORD_HASH=unused`). Source is Microsoft Planetary Computer, accessed anonymously. |
| GeoDaRT output | One GeoTIFF per acquisition date, `Sentinel2_<YYYY-MM-DD>_<4hex>.tif` (`_process_s2_date` in `API/Sentinel/sentinel2_downloader.py`). The file is a float32 stack, nodata = NaN, EPSG:4326 (we request it), 10 m grid. Band descriptions are set: B01…B12, B8A, AOT, WVP, SCL, TCI_R/G/B, MSK_CLDPRB, MSK_SNWPRB, then **NDVI last**. Reflectance bands are raw DN (÷10000). |
| Ingest (`lib/context-fetch.ts`) | Should need no changes. `"sentinel"` routes the file to `Sentinel2`, and `captureDateFromName` parses `2025-06-01`, so each date becomes a `Context_Rasters` row with `capture_date` + `footprint`. |
| Timeline API (`lib/context-timeline.ts`) | Already returns `imagery: [{date, rasterId, product}]` for `Sentinel2`, keeping the newest file per date. |
| Timeline UI (`components/context-timeline.tsx`) | Already draws imagery ticks on their own track. When imagery exists, the playhead snaps to imagery dates. The selected date (`timelineDate`) is state in `FarmMap`, ready for a layer to follow. |
| Pattern to copy | Terrain: `lib/terrain-render.ts` (geotiff.js → sharp WebP, disk cache under `THUMBNAIL_DIR`, `RENDER_VERSION`) + `GET /api/context/rasters/[id]/terrain` (session + `scopeIncludesFarm`) + `TerrainLayer` (`L.imageOverlay` in its own pane). |

Only the render endpoint, the map layer and the timeline additions are missing.

## Proposed design

### 1. Render endpoint: `GET /api/context/rasters/[id]/imagery?mode=rgb|ndvi`

New `lib/imagery-render.ts`, a sibling of `terrain-render.ts`:

- **Bands by description**, not index. geotiff.js's `getGDALMetadata(sample)` gives each band's name. If the descriptions don't come through, fall back to GeoDaRT's default band order, which has NDVI as the last band.
- **`rgb`**: stretch B04/B03/B02 reflectance (offset-corrected, see Phase 0) over a **fixed** 0–0.3 range with a mild gamma. GeoDaRT doesn't return `TCI_*`. Use a fixed stretch, not a per-frame percentile one, so brightness doesn't jump between dates while scrubbing.
- **`ndvi`** (default mode): computed from offset-corrected B04/B08, not GeoDaRT's NDVI band (see Phase 0). Fixed **red → yellow → green** ramp from 0 (red) through 0.5 (yellow) to 1 (green). Values below 0 (water, bare wet soil) are clamped to red. Show a legend, and put the ramp in its own module (e.g. `lib/ndvi-ramp.ts`) shared with the legend, the way `terrain-ramp.ts` is shared.
- **Cloud mask** (optional `&mask=1`, on by default): use SCL classes 3 (cloud shadow), 8–10 (cloud medium/high, cirrus) and 11 (snow). Masked pixels and NaN become transparent. See "How cloud cover works" below.
- Response: `{bounds, mode, clearFraction, imageUrl}`. `?format=image` returns the WebP. Cache it as `THUMBNAIL_DIR/context-imagery/<sha256>.<mode>.<mask>.v<N>.webp`.
- Auth: same as the terrain route (session + `scopeIncludesFarm(scope, raster.farm_id)`, 404 otherwise).
- Size: a large farm AOI is ~700 × 900 px (Phase 0), so a WebP render is tens to a few hundred KB. Reading the 3–4 needed bands takes well under a second; cache the render.

### 2. Map layer (`components/farm-map.tsx`)

- `ImageryLayer`, modelled on `TerrainLayer`. Give it its own pane at z-index ~340, so it sits below terrain (350) and vector overlays (400) and the Terrain layer can be drawn on top.
- Find the frame for `timelineDate` in `timeline.imagery`, then fetch its meta + image.
- **Avoid flicker:** add the new overlay and remove the old one only once the new image has loaded. Prefetch the two neighbouring frames.
- CSS `image-rendering: pixelated` on the overlay, so 10 m pixels look like pixels instead of a blur.
- Controls next to the Terrain checkbox: **Imagery: Off / True colour / NDVI**, an opacity slider, a **Mask clouds** checkbox, and the NDVI legend when NDVI is selected.

### 3. Timeline: the actual time series

- Extend `ImageryFrame` with `clearFraction` and `ndviMean`, both computed over **the farm's field boundaries** (the union of its `Fields.geometry`), not the whole pulled AOI. `clearFraction` is the share of field pixels that are valid (not NaN) and not cloud, shadow or snow in SCL. `ndviMean` is the mean NDVI over those clear field pixels. A farm with no field geometry falls back to the raster's `footprint`. Use pixel-centre-in-polygon, the same as `readShares()`. At 10 m a 5 ha field is ~500 pixels, which is plenty for a stable fraction. Compute them lazily and memoise per `sha256`, exactly like `usdmShares()` in `context-timeline.ts`. That means no migration. A year of frames for one farm is about 100 small files, so the first request reads them in a second or two and later ones come from memory.
- The memo key must include a hash of the field geometry, so editing a field boundary recomputes the stats.
- Shade each imagery tick by clear fraction: solid when ≥ 80% of field pixels are clear, faint when cloudy.
- Add a **Skip cloudy dates** toggle (default on). The playhead only snaps to frames above the threshold.
- **NDVI sparkline** above the imagery track: the mean of clear pixels per date, with cloudy frames left out. This is the actual "time series" view, and it lines up with the drought strip on the same axis.

### How cloud cover works (GeoDaRT v1.8, checked in the server source)

GeoDaRT does **scene-level selection only**. Clouds over the farm are left in the imagery, and GeoDaRT ships the band we need to find them.

- **Selection:** the Planetary Computer STAC search filters on `eo:cloud_cover <= max_cloud_coverage`. That is ESA's cloud percentage for the *whole* ~110 km MGRS tile, so it is a weak proxy for the farm. A 30% cloudy tile can have a clear farm, and a 5% cloudy tile can have its one cloud right over it. `S2Request` defaults this to 100, so with nothing sent every overpass comes back.
- **No per-pixel masking:** the request has `apply_cloud_masking`, `cloud_probability_threshold` and related options, but the active code path ignores them. `run_sentinel2_request` doesn't pass them to `download_and_mosaic_sentinel2_aoi_mpc`, and `s2_cloud_masking.py` isn't imported. Cloudy pixels arrive as normal reflectance and NDVI values.
- **Mask bands are included:** every file contains **SCL** (ESA's scene classification: 3 = cloud shadow, 8/9 = cloud medium/high probability, 10 = thin cirrus, 11 = snow) and **MSK_CLDPRB** (cloud probability 0–100). The Dashboard uses these to mask and score each date per field, as described above.
- SCL is produced at 20 m and resampled onto the 10 m grid, so cloud edges are blocky, and it tends to miss thin haze. GeoDaRT doesn't return `MSK_CLDPRB`, so SCL is the only mask unless GeoDaRT's default band list changes.

### 4. Pull dialog / request tweaks

- **The Dashboard doesn't send `max_cloud_coverage` today, so GeoDaRT's default of 100 applies and it returns every overpass.** That's roughly every 3–5 days, most of them cloudy over upstate NY. Add a Sentinel-2 "max scene cloud %" input (default 40, same as the Client's `--s2-max-cloud`) and send it as `selections[].options.max_cloud_coverage`.
- Warn when Sentinel-2 is ticked with a range longer than about a year. GeoDaRT reads every date from Planetary Computer, so long pulls are slow.

### Done early: drop cloudy dates (2026-10-29)

The user asked for this before the rest of Phase 2. A date is dropped when under 50% of the pixels inside the union of the farm's field polygons are clear by SCL. Dropped dates are deleted (file and row): skipped at ingest, and swept once at every server start for older pulls. See `lib/imagery-cloud.ts`. Test: farm 18's 2025-06-08 file scores 42% clear on the field (23% across the whole raster), so it's dropped. Locally, the first startup sweep removed 37 of farm 18's 55 2026 dates; the 18 left score 54–100% clear on the field. The rest of Phase 2 (`ndviMean`, cloud-shaded ticks, sparkline, `max_cloud_coverage` in the dialog) is still to do.

## Phasing

| Phase | Scope | Rough size |
|---|---|---|
| 0 | Run a real pull on production (or point local dev at a reachable GeoDaRT). Confirm the zip layout, filenames, band descriptions in geotiff.js and the per-date file count. | Short; needs `GEODART_PASSWORD_HASH` on production |
| 1 | Render endpoint + `ImageryLayer` + Off/True colour/NDVI control. Scrubbing the timeline moves the map. | ~1 day |
| 2 | Cloud stats (`clearFraction`, `ndviMean`), cloud-shaded ticks, skip-cloudy, NDVI sparkline, `max_cloud_coverage` in the pull dialog. | ~1 day |
| 3 | **Experiment zones: visual only.** Draw `ExperimentZones` outlines over the imagery/NDVI layer so treatment strips can be compared by eye. No per-zone statistics or per-zone time series. | ~½ day |
| 4 | **OFE Dashboard**: the whole spatial-context view (terrain, drought timeline, Sentinel imagery/NDVI). See "OFE Dashboard" below. | ~2 days |

## OFE Dashboard (farmer-facing)

Decided 2026-10-28: the NDVI viewer and the whole spatial-context view (terrain layer, drought + imagery timeline) go on OFE Dashboard too.

OFE has no spatial-context code today. It shows FDL pipeline rasters and tiled basemaps via `src/lib/fdl-rasters.ts`, which proxies `GET /api/data/farms/[id]/rasters/...` with its service token. It also has a placeholder field page, `fields/[id]/context` ("Context & Layers… NDVI… pending an imagery pipeline"), which this fills. Same rule as the existing raster layers: **FDL renders, OFE proxies.** No raster bytes or render code live in OFE.

**FDL side (Dashboard-UI)**: new bearer routes under the farm, service-only (not in `RESTRICTED_ALLOWED_ROUTES`), each 404ing a raster that belongs to a different farm, matching the existing raster routes:
- `GET /api/data/farms/[id]/context/timeline[?field_id=]` returns the same JSON as the session route. With `field_id`, `clearFraction`/`ndviMean` are scored over that one field instead of the union of all fields, for OFE's per-field page.
- `GET /api/data/farms/[id]/context/rasters/[rasterId]/terrain[?format=image]`
- `GET /api/data/farms/[id]/context/rasters/[rasterId]/imagery?mode=…[&format=image]`

These reuse `lib/context-timeline.ts`, `lib/terrain-render.ts` and the new `lib/imagery-render.ts`; only the auth wrapper differs. Their `imageUrl`s must point at OFE's proxy, so OFE rewrites them, or the routes return a relative image path OFE resolves.

**OFE side**:
- `src/lib/fdl-context.ts`, a sibling of `fdl-rasters.ts`: fetches the timeline and render meta. It never throws, so an unreachable FDL or an OFE-only farm just means no context layers.
- Proxy routes `src/app/api/farms/[id]/context/...`: authorise the user against the OFE farm, map it to `fdl_farm_id` (and the OFE field to its FDL field id), and stream FDL's JSON/WebP through.
- Components copied from Dashboard-UI and adapted (the same arrangement as the forms copy): `context-timeline.tsx`, the Terrain/Imagery layers and the NDVI legend/ramp. **Any later change to the timeline or ramp must be made in both repos.** Note this in both `CLAUDE.md`s.
- Placement: farm landing map (`landing-client.tsx`) gets the layer toggles + timeline under the map. `fields/[id]/context` gets a field-zoomed map with the NDVI layer and a timeline scored for that field (`?field_id=`).
- The pull itself stays lab-side. Farmers see whatever the lab has pulled; there's no "Pull spatial context" button in OFE.

When OFE adds these, also update the root `CLAUDE.md` note that lists the FDL routes OFE consumes.

## Risks / unknowns

- **Occasional misregistered date (known, not fixed).** Farm 18's 2026-10-21 file is ~95 m NE of every other date (5 px E, 8 px N; NIR correlation vs 10-26 is 0.86 shifted, 0.32 in place) despite identical bounds/metadata — upstream scene or GeoDaRT tile mosaicking, undiagnosed. All 31 other production dates align to the pixel. Judged an edge case 2026-10-29; if it recurs, co-register each date against the farm's clearest one and shift the overlay bounds.

- **Not tested end to end.** Phase 0 needs a real pull. Local dev can submit but can't download (the signed links point at the lab server).
- The `_b0`…`_b9` tokens in `PRODUCT_MATCH_TOKENS` are matched against the whole zip path. A non-Sentinel file whose path contains `_b` followed by a digit (for example a hex id after an underscore) would be misfiled as Sentinel2. Check the zip paths in Phase 0, and consider matching on the top-level product folder instead.
- `captureDateFromName` takes the first date-like match in the *basename*. That's correct for `Sentinel2_2025-06-01_ab12.tif`, but the format belongs to GeoDaRT and could change.
- Clipping is to the AOI ring, but `_process_s2_date` keeps the full AOI extent and fills gaps with NaN. Partial-tile dates (AOI on an MGRS tile edge) will look patchy. The clear fraction should count NaN as not clear.
