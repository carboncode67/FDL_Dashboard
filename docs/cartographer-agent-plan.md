# Cartographer agent — scoping

**Status (2026-11-15):** C0–C3 built and verified locally, committed, **not deployed** (needs migrations 098 + 099 on prod, an FDB deploy, a Cartographer token and `agents.sh serve` on Datamachine). C0: `lib/geo-tools.ts` + editor quick actions. C1: agent kinds. C2: requests, map-bound runs, drafts, apply/undo (`scripts/e2e-agent-requests.sh`, 28 checks). C3: Cartographer runner + prompt + serve mode, "Ask Cartographer" panel in the sampling-map editor. C4 (apps) and C5 (render/deliver) not started.
platform in `docs/agent-sandbox-plan.md` (tokens, `/api/agent/*`, broker/runner
sandbox on Datamachine), where Data Sleuth is the first agent.

## 1. What it is

An **interactive** agent that people call from the web UI (and later the phone
apps) to do map work in plain language:

- "Make a 10 m square centred on this point and put sampling points at its NE,
  NW, SW and SE corners."
- "Put 3 stratified random points in each management zone of Field 7, at least
  20 m apart and 10 m in from the edges."
- "Add a transect every 25 m along the line I just walked."
- "Make a map of this field's sampling points over the latest NDVI and email it
  to me."

The model **plans**; deterministic **geometry tools compute**. A language model
never does coordinate math itself: a 10 m square is `offset(center, 45°,
7.071 m)` etc., computed in code, so results are exact and reproducible.

### How it differs from Data Sleuth

| | Data Sleuth | Cartographer |
|---|---|---|
| Trigger | nightly batch | a person, on demand, from the UI/app |
| Latency | hours are fine | seconds to ~1 min |
| Who it acts for | the lab (its own token) | **the requesting user** — their permissions apply |
| Output | recommendations only | **geometry drafts** that the user accepts with one click/tap, plus rendered maps |
| Main risk | prompt injection in uploads | wrong geometry; acting beyond the user's rights; sending things to people |
| Main input | untrusted uploads | the user's own request (trusted-ish) + map data (labels and notes untrusted) |

## 2. The example, end to end

1. On the phone, a lab member collects a point on sampling map 12 (this already
   exists: `POST /api/data/sampling-maps/[id]/points`, `placement_method: "field"`).
2. They tap the point → **Ask Cartographer** → "10 m square centred here, points
   at NE NW SW SE".
3. The app posts an **agent request** with context `{sampling_map_id: 12,
   point_id: 881}`. It shows "working…".
4. The Cartographer worker on Datamachine claims the request. The model reads
   point 881 (via the read API) and calls
   `square_around_point(center=881, side_m=10, rotation_deg=0, corners=true)`.
   The tool returns a polygon and 4 labelled points (NE/NW/SW/SE, each 7.071 m
   from the centre at 45°/315°/225°/135°).
5. The model saves a **draft** (`Agent_Geometry_Drafts`) with those features and
   a one-line explanation of how it read the request ("axis-aligned square, sides
   running N–S/E–W, corners on the diagonals").
6. The app shows the draft as a dashed overlay. The user taps **Add to map**,
   which is the user's own write through a normal route with their permissions.
   Points land as `placement_method: "agent"` with labels "881-NE" and so on.

The confirm step resolves ambiguity ("pointing NE" could mean a rotated square)
without a back-and-forth. People see exactly what will be added before it is.

## 3. Architecture

```
 web UI / phone app                Dashboard (FDB)                       Datamachine (sandbox)
 ───────────────────               ─────────────────────────────────      ─────────────────────────────
 "Ask Cartographer" ──POST──▶  Agent_Requests (queued)
                                    ▲  claim (long-poll)  ◀──────────── broker ◀── dispatcher (host,
                                    │                                       │        user `agents`)
                               /api/agent/read/* (map, points…)  ◀──────────┤        spawns one runner
                               /api/agent/compute/geo/*  (pure)  ◀──────────┤        per request
                               /api/agent/write/geo_drafts       ◀──────────┘
 draft overlay  ◀──GET──────  Agent_Geometry_Drafts (draft)
 "Add to map" ──POST apply──▶ session / bearer route as the USER
                               → Sampling_Points / Sampling_Map_Polygons
```

- **Geometry runs in the Dashboard** as pure functions (`lib/geo-tools.ts`),
  exposed to agents as `/api/agent/compute/geo/*` and called directly by the UI.
  One implementation is shared by agents, the web editor and the apps. The
  sandbox doesn't need a geometry stack, and the server can re-verify any
  feature a draft claims came from a tool.
- **Raster-based stratification** (NDVI, yield-map or soil quantile classes)
  runs as a PipelineProcessor job, since it already has rasterio. The job is
  async and returns class polygons. Same pattern as tiling and yield cleaning.
- **The agent never writes sampling data.** It writes drafts. Applying a draft is
  the user's action, through a route that checks `canEdit`, scope (`scopeIncludesFarm`)
  and `ofeLock`, exactly like the editor does today.

## 4. Geometry tool library (v1)

All geodesic (WGS84; distances in metres, bearings in degrees clockwise from
true north). Every tool is deterministic. Random tools take a `seed`, which is
recorded in the draft so a layout can be regenerated exactly.

| Tool | Does |
|---|---|
| `offset_point(point, bearing_deg, distance_m)` | one point at a bearing/distance |
| `points_around(center, pattern, size_m, rotation_deg)` | patterns: `square_corners`, `cross` (N/E/S/W), `ring(n)`, `star` |
| `shape_around(center, shape, size_m, rotation_deg)` | square / rectangle / circle polygon |
| `grid_in_polygon(polygon, spacing_m, edge_buffer_m, rotation_deg)` | extends today's `generateGridPoints` (adds buffer + rotation) |
| `random_in_polygon(polygon, n, min_spacing_m, edge_buffer_m, seed)` | extends `generateRandomPoints` (adds seed + buffer) |
| `stratified_random(strata[], n_per_stratum \| total+allocation, min_spacing_m, edge_buffer_m, seed)` | strata = zones, fields, sampling-map polygons with `purpose: "stratum"`, or raster classes |
| `transect(line \| start+bearing+length, spacing_m)` | points along a line |
| `buffer / clip / union(geom, …)` | `@turf/buffer` is already a dependency |
| `measure(a, b)` / `area(polygon)` | distance and bearing; area |
| `inside(point, polygon)` | validation, e.g. warn when a corner falls outside the field |
| `raster_strata(raster_id, polygon, classes, method)` | async, PipelineProcessor (quantiles / Jenks over NDVI, yield, soil) |

These tools are worth building **before** the agent. With a small form, the
same functions back "quick actions" in the sampling-map editor (and later the
apps): *long-press a point → square/cross around it*, *polygon → stratified
points*. A large share of real requests are this kind of template, needing no
LLM at all, so they're instant and work offline-first on the phone. The agent
then covers the free-form remainder ("…and skip the waterway, and label them
by zone").

## 5. What changes in the existing framework

This is the main work: turning the Data-Sleuth-shaped platform into one that
hosts several agent *kinds*.

### 5.1 Identity and permissions (Dashboard)

| Today | Change |
|---|---|
| `Agent_Tokens` is per lab with scopes `read` / `write` | Add `agent_kind` (`sleuth` \| `cartographer` \| …). Make scopes capability strings: `read`, `observations`, `recommendations`, `requests.claim`, `geo.draft`, `deliver`. `withAgent(req, scope)` checks the capability. A Sleuth token can't claim requests, and a Cartographer token can't write observations. |
| An agent acts as the lab | A Cartographer run is bound to **one request**. Its writes must cite that `request_id`, and the server checks every referenced map/point against **the requester's** scope (`getEffectiveScope` for that user), not just the lab. An agronomist with a hard scope can't get the agent to draft on a farm they can't see. |
| One read allowlist (`AGENT_TABLES`) | Per-kind allowlists: add `kinds?: AgentKind[]` to registry entries. Cartographer reads maps, points, polygons, fields, zones, farm layers, basemaps, context rasters, yield runs and pipeline rasters. It doesn't read notes, photos or transcripts. |

### 5.1a One map per run, and nothing destructive (decided 2026-11-15)

Two independent server-side guards. Neither depends on the prompt or on the
runner behaving.

1. **No destructive capability anywhere.** The agent has no write path to
   sampling data at all. It only creates drafts. Applying a draft only
   **inserts** points and polygons, and there is no update or delete path. Every
   applied feature carries `agent_draft_id`, and **Undo this draft** removes
   exactly those rows. Editing or deleting existing points stays a normal human
   action in the editor.
2. **The run is bound to the active map.** A request must name exactly one
   `sampling_map_id` (the map open in the editor or app). On claim, the server
   stores that map on the run (`Agent_Runs.scope_map_id`). Every `/api/agent/*`
   call resolves run → request → map server-side and narrows the registry scope:
   - **Sampling tables:** points, polygons and collections only where
     `sampling_map_id` is that map.
   - **Farm context:** fields, zones, farm layers, basemaps, context rasters and
     yield runs only where `farm_id` is that map's farm, read-only. This is so
     the agent can check "inside the field" and avoid waterways.
   - **Everything else:** refused, including other maps, other farms and all
     non-spatial tables.
   - **Drafts and compute calls:** `geo_drafts` and `compute/geo/*` inputs that
     reference another map, or a point or polygon not on it, get 404 (the same
     answer as "doesn't exist").
   - **Lifetime:** the binding ends when the request closes. One fresh runner
     container per request, so nothing carries over between requests or users.

   Optional stricter mode: drop the farm-context reads, so the agent sees only
   the map. Not recommended, because field boundaries are how it catches its
   own mistakes.

### 5.2 New tables (one migration)

- **`Agent_Requests`**: `lab_id`, `agent_kind`, the requester (`user_id` **or**
  `contact_id`), `channel` (`web` \| `app`), `prompt` (≤ 2000 chars), `context`
  JSONB (`sampling_map_id`, `point_id`, `farm_id`, a location),
  `status` (`queued` → `claimed` → `done` \| `failed` \| `cancelled`), `run_id`,
  `claimed_at`, `answer` (the agent's short reply), timestamps. RLS on `lab_id`.
  Requests time out if unclaimed for N minutes ("the agent is offline").
- **`Agent_Geometry_Drafts`**: `request_id`, `run_id`, `sampling_map_id`,
  `features` (a GeoJSON FeatureCollection with properties `label`, `purpose`,
  and `role: point|polygon`), `explanation`, `provenance` (the exact tool calls
  and parameters, including seeds), `status` (`draft` → `applied` \| `discarded`),
  `applied_by`, `applied_at`. Must target the run's `scope_map_id` (§5.1a). Each feature is re-validated server-side (valid
  geometry, within N km of the farm, count ≤ cap). With `provenance`, the
  server can recompute any tool-made feature and reject one that doesn't match.
- `Sampling_Points.placement_method` gains `"agent"`. `Sampling_Map_Polygons.source`
  gains `"agent"`. Both are free text today, so no constraint changes are needed.
  Both tables also gain nullable `agent_draft_id`, which drives Undo (§5.1a).
- `Agent_Runs` gains nullable `scope_map_id` (set on claim; §5.1a).
- *(Later)* **`Agent_Deliveries`**: a rendered map plus recipient plus channel,
  with status `draft` → `sent`. See §5.6.

### 5.3 API (Dashboard)

| Route | Auth | For |
|---|---|---|
| `POST /api/agent-requests` / `GET …/[id]` / `DELETE …/[id]` | session | web UI: ask, poll status, cancel |
| `POST /api/data/agent-requests` (+ `GET`) | bearer (lab-member app tokens) | phone apps. Add to `RESTRICTED_ALLOWED_ROUTES` (`lib/route-scopes.ts`) |
| `POST …/agent-requests/[id]/drafts/[draftId]/apply` (+ bearer twin) | user | **apply as the user**: `canEdit`, `scopeIncludesFarm`, `ofeLock`, then insert points and polygons in one transaction |
| `POST /api/agent/requests/claim?kind=cartographer` | agent `requests.claim` | worker long-poll (~25 s) |
| `POST /api/agent/requests/[id]/answer` | agent | final reply text + status |
| `POST /api/agent/compute/geo/<tool>` | agent `read` (and a session twin for the UI) | the §4 tools |
| `POST /api/agent/write/geo_drafts` | agent `geo.draft` | draft write: tied to the claimed request, capped, validated |

The apps also need **draft display**: `GET /api/data/sampling-maps/[id]`
optionally includes the requesting user's open drafts, so the overlay arrives
with the map they already sync.

### 5.4 Sandbox (Client/agents + Datamachine)

| Today | Change |
|---|---|
| `runner.py` *is* Data Sleuth (one class, `SLEUTH.md`) | Split it into a shared core (chat loop, `untrusted()`, broker client) plus per-agent modules: `runner/agents/sleuth.py`, `runner/agents/cartographer.py`, and `prompts/<kind>.md`. `main` dispatches on the agent kind. Sleuth moves onto this unchanged. |
| `tools.py` is one flat tool set | Common tools plus per-kind sets. The **broker** enforces the set for the token's kind: it learns the kind at `/run/open` from the Dashboard's response, so a modified runner can't offer the model another agent's tools. |
| Batch only: `agents.sh once …` from a nightly timer | Add **serve mode** for interactive kinds. A host dispatcher (systemd user service under `agents`) keeps proxy and broker up, long-polls `claim` through the broker, and starts **one fresh runner container per request**, so requests from different users never share a process. Run `--rm`, with a per-request step and time cap (e.g. 12 steps, 90 s). |
| One model for everything | Cartographer mostly needs tool-calling, not world knowledge. A smaller fast model (kept warm with Ollama `keep_alive`) gives seconds-level latency and leaves the GPU free for Sleuth's nightly run and PipelineProcessor. Model per kind goes in `.env` (`AGENT_MODEL_CARTOGRAPHER`). |
| Probes check one shape of stack | Same probes, plus: the runner gets no `requests.claim` path (only the broker does), and a Cartographer token is refused on Sleuth endpoints and vice versa. |

The egress firewall, proxy allowlist, Caddy LLM route and token handling don't
change. Serve mode only means the proxy and broker are long-lived, as Ollama
already is.

### 5.5 UI

- **Sampling-map editor (web):** an "Ask Cartographer" panel in the side panel
  (text box, request history, status), plus draft overlays (dashed, with
  Apply / Discard / "regenerate with another seed"). The §4 quick actions go on
  point and polygon context menus with **no LLM**.
- **Apps (Swift + Kotlin):** on a selected point or polygon, an "Ask" sheet
  (text now, voice later, since both apps already record audio). Requests go
  into the existing upload queue so they survive no signal. The app shows the
  draft overlay with **Add to map** and works offline once the draft has synced.
  The §4 quick actions can run **on-device** for the common templates; the
  geometry functions are small enough to port.

### 5.6 Maps and sending them ("generate maps and send them to users")

- **Rendering:** a PipelineProcessor endpoint `POST /render/map` (basemap tiles
  or NAIP or a context raster, plus fields, points and labels, plus a legend and
  scale bar, out to PNG/PDF). It's called by the **Dashboard**, never by the
  agent directly. The output is saved as a farm `Documents` row. The agent asks
  for it with a `render_map` tool that only queues the job.
- **Sending is outward-facing**, so v1 is deliberately narrow:
  - **Requester only:** the agent can deliver only to the person who asked, via
    the in-app/web request reply (a link to the document) or email to their
    address (`lib/mailer.ts`).
  - **Everyone else needs a click:** anything addressed to someone else (a
    farmer over WhatsApp or SMS via OFEDashBot, a colleague) becomes an
    `Agent_Deliveries` draft that a person approves. That's the same
    suggest → approve rule as Data Sleuth.

## 6. Safety notes

- **Acting for a user.** The agent can never do more than the requester could.
  Drafts are checked against the requester's scope, and applying is done by the
  requester through the normal permission checks.
- **Injection.** The request text is the user's own, so it's trusted to the
  extent the user is. But map names, point labels and polygon notes may come
  from farmers (OFE-synced maps, phone points), so they're still wrapped as
  untrusted data. Damage is bounded anyway: a draft is inert until a person
  applies it, and sending to others needs approval.
- **OFE-owned maps** (`ofe_id` set) are read-only in FDB (`ofeLock`). The
  Cartographer can draft on them for preview, but apply returns 409 with "edit
  this in OFE Dashboard". *(Later: an OFE twin of apply.)*
- **Caps.** Points per draft (≤ 2000, matching `generateGridPoints`), drafts per
  request, requests per user per hour, and run time per request.
- **Geometry sanity.** Every feature must be valid and within a radius of the
  farm, and the response warns if a point falls outside the field. Seeds and
  parameters are stored so any layout can be audited and reproduced.

## 7. Phases

| Phase | What | Needs an LLM? |
|---|---|---|
| **C0** | `lib/geo-tools.ts` (§4 tools, geodesic and seeded) + session `compute` routes + editor quick actions (square/cross around a point, grid/random/stratified in a polygon with edge buffer). Unit-test the geometry against known coordinates. | no |
| **C1** | Multi-agent platform: `agent_kind` + capability scopes on tokens, per-kind registry, per-kind tool sets enforced by the broker, runner split into core + agents. Sleuth migrates; its probes and §8 suite must still pass. | — |
| **C2** | `Agent_Requests` + `Agent_Geometry_Drafts` + apply routes (web) + serve mode on Datamachine (dispatcher, per-request runner). | — |
| **C3** | Cartographer prompt + tools; web "Ask Cartographer" panel; draft overlays. | yes |
| **C4** | Phone apps: request via upload queue, draft overlay, Add to map, on-device quick actions (Swift, then Kotlin). | yes |
| **C5** | `render_map` (PipelineProcessor) + requester-only delivery; `raster_strata`; delivery drafts for others. | yes |

C0 is useful on its own and is the foundation for everything after it. C1 is
the "make room for more agents" refactor and is worth doing before a second
agent exists in code.

## 8. Open decisions

1. **Confirm or auto-apply.** The recommendation is draft → one-tap apply.
   Allow auto-apply for small drafts on maps the requester owns?
2. **Who can ask.** Lab members only (recommended for v1), or farmers (contact
   tokens) too? Farmers asking would put contact tokens on a new route.
3. **Model.** Pick a smaller, fast tool-calling model for Cartographer, and
   test it on the §4 tools before C3.
4. **Delivery channels** in v1: in-app/web plus email to the requester, with
   WhatsApp/SMS to others later behind approval?
5. **OFE maps.** Refuse to apply (v1), or build an OFE-side apply so farmers'
   own maps can use it?
