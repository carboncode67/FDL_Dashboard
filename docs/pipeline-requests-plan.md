# Pipeline requests and reviewed pipeline definitions — plan

> **Status (2026-11-23):** phases 1–3 built, uncommitted: request intake; ops, definitions, executor,
> catalogue and generic ingest (first pipeline `yield-clean-krige`, status testing); upload trigger
> rules. The legacy script pipelines were removed outright (none were in use): Dashboard `/pipelines`
> + `/api/pipelines/*`, processor `/pipelines/*`, `ollama_wiring.py`, `sandbox.py`, `standard_image/`.
> Their tables stay, read-only. Migrations 105–107 on local dev only; not yet tried in a browser or
> with the real yieldclean image. Phases 4–5 are plan.

## Goal

The web UI says **what** a workflow is: its inputs, its outputs, its settings, and a plain-language
description. The code that does it is written and reviewed by the developer. Nothing a user types or
uploads in the UI is ever executed.

The request list is also how the lab sees what people are asking for.

Later, once existing pipeline code is broken into reviewed step modules, users can build new
pipelines by putting those steps in a new order (phase 4, future goal).

## Decisions

| Question | Decision |
|---|---|
| Who writes pipeline code | The developer only. Code review in the PipelineProcessor repo is the security gate. |
| Who can submit a request | Anyone with a login (any role). |
| Who moves a request past "requested" | Admins only. |
| How the skeleton reaches the developer | Direct download from the Dashboard (YAML, or a zip with the attachments). No GitHub integration for now. |
| Uploaded scripts | Attachments for the developer to read. Never built or run automatically. |
| File format | The same `pipeline.yaml` shape for a request skeleton and a finished pipeline. A request has `steps: []`; the developer fills it in. |

## Lifecycle

```
requested → accepted → in_development → testing → live → retired
     └──────────→ declined (with a note)
```

* **requested**: submitted from the form. The requester can still edit it.
* **accepted / declined**: admin triage, with a note shown to the requester.
* **in_development**: the developer has the skeleton and is writing it.
* **testing**: deployed to the processor, run on the request's sample data, results shown on the
  request for the requester to confirm.
* **live**: can be triggered (manually or by matching uploads). Set automatically when the
  processor's catalogue reports the pipeline (see "Processor side").
* **retired**: no new runs; history kept.

## The `pipeline.yaml` contract

```yaml
key: 0007-canopy-cover        # <request id, zero-padded>-<slug>; stable for the pipeline's life
version: 1                    # bumped by the developer on any change to steps or outputs
name: Canopy cover from drone ortho
status: requested
requested_by: <user id>
description: |
  For each field, % green canopy from the ortho, as a map layer and a per-field table.
inputs:
  - name: ortho
    kind: basemap
    trigger: manual           # manual | match
    data_product: imagery     # optional hint for the agent (lib/data-products.ts)
  - name: fields
    kind: farm_fields
outputs:
  - name: cover_map
    kind: raster_tiles
  - name: cover_by_field
    kind: table
params:                       # settings a user may change per run or per live pipeline
  - {name: threshold, type: number, default: 0.1, min: 0, max: 1, help: "ExG cut-off"}
sample_data:                  # references to existing records, not copies
  - {kind: basemap, id: 4}
attachments:                  # small uploaded files, for the developer to read
  - reference_script.py
steps: []                     # developer fills in, e.g.
                              # - {op: exg_index, in: {raster: ortho}, out: exg}
                              # - {op: threshold_raster, in: {raster: exg}, params: {t: $threshold}, out: cover_map}
                              # - {op: zonal_stats, in: {raster: cover_map, zones: fields}, out: cover_by_field}
```

### Kinds (fixed lists, extended only by the developer)

**Input kinds**, each with the record the run receives:

| Kind | Source | Match rule (for `trigger: match`) |
|---|---|---|
| `upload` | Photos / Notes / Recordings / Lab_Member_Uploads | table, category, project |
| `document` | Documents | Data Table template |
| `test_data_rows` | Test-data rows | Data Table |
| `basemap` | Basemaps (ready) | — (manual, or "new basemap on farm") |
| `drone_flight` | Drone flight records | — (manual) |
| `farm_fields` | Fields of the run's farm | — (context) |
| `experiment_zones` | Experiment_Zones of the run's experiment | — (context) |
| `yield_card` | A yield card upload | as `upload` |
| `context_rasters` | Farm Context_Rasters (Sentinel-2, 3DEP, POLARIS) | — (context) |

**Output kinds**, each with where it lands (existing sinks, so no new storage per pipeline):

| Kind | Lands in |
|---|---|
| `raster_tiles` | A Basemaps-style tiled raster on the farm map |
| `raster_file` | `Pipeline_Output_Rasters` (CRS-checked, as today) |
| `vector_layer` | `Farm_Layers` (with `_color` styling) |
| `table` | A CSV farm Document (later: Data Table rows) |
| `document` | A farm Document |

A request can only choose from these lists. "Something else" goes in the description, and adding a
kind is a developer change on both sides.

## Dashboard side

### Tables (new migration)

`Pipeline_Requests`:
* `id`, `lab_id` (tenant RLS like other root tables), `requested_by_id`, `created_at`, `updated_at`
* `name`, `description`
* `inputs`, `outputs`, `params`, `sample_data` (JSONB, the YAML's sections)
* `status`, `admin_note`
* `pipeline_key` (set once accepted), `live_version` (from the catalogue)

`Pipeline_Request_Attachments`: `request_id`, `original_name`, `stored_name`, `bytes`, under
`DATA_DIR/pipeline-requests/<id>/`. Capped at about 25 MB each. Large sample data is referenced by
record id in `sample_data`, not uploaded again.

### UI (`/pipelines`)

* **Requests tab** (all users): list with status, requester and date; filter by status; "New request".
* **New request form**: name, description, inputs (kind + match rule), outputs (kind), settings
  (name/type/default), sample data picker (existing uploads/basemaps/flights), attachments.
* **Request page**: everything above; requester edits while `requested`; admins change status and
  write a note; **Download skeleton** (`pipeline.yaml`, or a zip with attachments).
* **Pipelines tab**: live pipelines from the catalogue, their triggers and default settings
  (editable by editors; data only), and run history.

### Routes

* `GET/POST /api/pipeline-requests`, `GET/PATCH /api/pipeline-requests/[id]`
  (requester edits own while `requested`; admin changes status).
* `POST /api/pipeline-requests/[id]/attachments`, `GET .../attachments/[name]`.
* `GET /api/pipeline-requests/[id]/skeleton` → YAML; `?zip=1` → zip with attachments.

## Processor side (PipelineProcessor)

* **Step modules** `ops/<name>.py`, each registered with: name, version, typed inputs and outputs
  (the kinds above, plus intermediate `raster` / `vector` / `table`), a JSON Schema for its params,
  and how it runs (host, GPU lock, or Docker sandbox for wrapped third-party code).
* **Pipeline definitions** `pipelines/<key>/pipeline.yaml`: the request skeleton with `steps`
  filled in. Checked at startup: every op exists, and each step's input types match what feeds it.
* **`GET /pipelines/catalog`**: live definitions (key, version, inputs, outputs, params) and the op
  list. The Dashboard reads it on the Pipelines page and marks matching requests `live`.
* **`POST /v2/runs/{id}/run`** `{key, version, inputs: {name: download URL / ids}, params}` (built
  under `/v2/*` so it sits beside the legacy `/pipelines/*` routes):
  one generic executor runs the steps in order, then calls back with outputs by kind. One generic
  ingest on the Dashboard routes each output to its sink.

## What went away (done 2026-11-23)

No legacy pipeline was in use, so these were removed outright rather than migrated:
* Script / requirements / model upload as a runnable pipeline.
* `ollama_wiring.py` (still imported by `main.py` for wiring and diagnose-and-retry).
* Per-pipeline Docker image builds from user-supplied requirements.
* `Pipelines.wired_command`, `wired_requirements`, `llm_notes`, `use_spatial_context`.

The Docker sandbox itself stays, as a run mode for reviewed ops that wrap outside code.

## Phases

1. **Request intake.** Migration, form, list, request page, admin status changes, skeleton
   download. No processor changes. Immediately useful as the request log.
2. **Step modules and the generic executor.** Op registry, `pipeline.yaml` loader and checks,
   catalogue endpoint, generic run route and ingest. Port yield clean → kriging as the first
   two-step pipeline to prove chaining.
3. **Live pipelines on the new model.** Triggers (reusing `lib/pipeline-match.ts`) and per-pipeline
   default settings; existing script pipelines re-implemented or retired; remove the LLM wiring.
4. **Agent links data to pipelines** (needs phases 1–2; only pipelines on the new model).
   * **Read-only catalogue tool** for the agent: key, name, description, input kinds and match
     rules, output kinds, the settings list. Not step code, run outputs, processor URLs or tokens.
   * **New proposal type, "link upload to pipeline input"**: `{source_table, source_id,
     pipeline_key, input_name}`. Shown beside the agent's sort suggestions; a person approves it in
     their own session, which starts the run. The agent never triggers a run itself and never
     sets settings (the pipeline's defaults are used).
   * **Dashboard checks before a proposal is shown** (failures are dropped, as with other
     proposals): input kind matches, same lab, farm in the approver's scope, pipeline live, no
     earlier run of this pipeline version on this upload.
   * **Where the agent helps:** uploads the deterministic matcher (`lib/pipeline-match.ts`) misses,
     e.g. an unsorted photo that is really a scale ticket. Request inputs can carry a
     `data_product` hint (the agent's existing vocabulary, `lib/data-products.ts`) to make this
     easier. When nothing fits, the "unprocessable data" flag can point at an open request, and
     the agent can suggest existing uploads as a request's sample data.
   * **Possible later:** an admin marks some pipelines "agent may auto-run": cheap, only add new
     outputs (never replace), only on sorted uploads, with a daily cap per pipeline. Everything
     else stays behind approval.
   * Request descriptions (written by lab members) become agent input. Acceptable: far less
     exposed than farmer content.
5. **(Future) user composition.** Users fill in `steps` from the op catalogue with type checking.
   Safe because every op is reviewed code; only the order and settings come from the UI.

## Not decided yet

* Which existing prod pipelines (from the script/LLM model) are still in use, and which to
  re-implement versus retire. Needs a look at prod `Pipelines` / `Pipeline_Runs`.
* Whether basemap tiling, NAIP packaging and machine vision become ops. Tiling and NAIP are
  infrastructure triggered by other features; vision has its own interactive loop. Likely only their
  compute steps become ops, later.
* Notifications to the requester on status changes (email via `lib/mailer.ts`, or in-app only).
