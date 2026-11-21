# Image labeling + machine-vision classification — scoping doc (issue #4)

Covers GitHub issue **carboncode67/FDL_Dashboard#4**, "Add Image labeling interface, and
machine vision classification to backend."

> **Status (2026-11-20):** **phase 2 built** (ahead of phase 1, at the user's request), not yet deployed.
> Migration 103 (all §4.1 tables except the `Annotations` columns, which wait for phase 4), `lib/vision.ts` +
> routes + a "Machine vision" card on the task page, PipelineProcessor `vision.py`/`vision_worker.py`. Labels can
> be added by GPS-point import (orthos) or the labels API. The click-to-label view (phase 1) is still to do. See
> the session log at the bottom for decisions that changed during the build.
>
> Decisions taken with the user:
> **DINOv3 frozen features + kNN / other light head** (not Grounding DINO, not fine-tuning);
> **build only the point-tagging UI ourselves, reuse CVAT for boxes/polygons**; four phases
> as in §6.

---

## 1. Goal

Researchers need to find objects of interest (animals, weeds, crop plants, …) in:

- **single photos** (hand-held, phone uploads, grouped), and
- **stitched drone orthos** (already uploaded as `Basemaps`, often GBs).

The task is either **detection** (point / box per object) or **instance segmentation**
(polygon per object). The loop the issue describes:

1. Upload photos (grouped) or an ortho, optionally with **field GPS points** as training data.
2. Tasks › New Task › *Image Annotation* → assign users, photos/orthos, optional points.
3. Choose: **create preliminary training data**, or **run detection now** (from imported
   points or an existing model).
4. Preliminary data = click points on photos / on the zoomable ortho, each with a class label.
5. First run: DINOv3 + light head separates objects of interest from background; candidate
   samples come back.
6. User refines candidates with **boxes** (detection) or **polygons** (segmentation).
7. **Train and Run** → retrain, predict, then accept the output or sort suggestions into
   correct / incorrect and go again.

Non-goals for this pass: fine-tuning DINOv3 or training a full detector (YOLO/DETR-style);
mobile-app labeling; text-prompted open-vocabulary detection (Grounding DINO). Any of these can
be added later behind the same tables — the head is swappable (§4.3).

---

## 2. What already exists

| Ingredient | Where | How it's reused |
|---|---|---|
| Workflow Tasks with `classification = "image annotation"` / `"image classification"`, assignees, `Task_Upload_Links` + upload picker | `app/(dashboard)/tasks/`, `Tasks`, `Task_Assignees`, `Task_Upload_Links` | A vision job *is* a Task; the new-task wizard gains a vision step. Photos link exactly as today. |
| CVAT integration — task creation from a workflow Task, completion webhook → COCO → `Annotations.shapes` JSONB | `lib/cvat.ts`, `POST /api/tasks/[id]/cvat`, `POST /api/annotations/webhook` | Box/polygon refinement (phase 4). Extended to upload **pre-annotations** and to accept **chip images** cut from orthos. |
| Orthos as `Basemaps` (S3 or local source, CRS check, footprint) + XYZ tiles + farm-map display | `Basemaps` (mig 074/089/093), `app/api/basemaps/`, PipelineProcessor `/basemaps/{id}/tile` | Zoomable ortho for point tagging and prediction overlays. The full-res source (not the tiles) is what the GPU job reads. |
| First-party "host job" pattern on PipelineProcessor — fixed image, Dashboard row + signed callback webhook, no LLM wiring | `/yield-runs/{id}/clean` + `app/api/yield-runs/webhook`, `/basemaps/{id}/tile` | Vision runs copy this shape exactly (§4.2). Not the user-script `Pipelines` path. |
| Datamachine GPU box | PipelineProcessor deploy target | Runs DINOv3. **Gap:** `run_in_sandbox()` never passes `--gpus` (`PipelineProcessor/CLAUDE.md`), so the vision job's own `docker run` must add it (and nvidia-container-toolkit must be present on Datamachine — verify). |
| Item groups (Forms/Sampling Maps) | mig 087, `lib/item-groups.ts` | Pattern only. "Images can be grouped" is covered by linking a set of photos to the vision task; no new photo-group table in this pass. |

---

## 3. Approach in one paragraph

Run **DINOv3 (frozen) once per image/ortho** to get dense **patch embeddings** (one 
feature vector per 16×16-px patch) and cache them on Datamachine. Every user label — a
clicked point, an imported GPS point, a confirmed/rejected prediction, later a box or polygon —
becomes a set of **labeled patch vectors**. A light head (**kNN** to start; logistic regression
/ small MLP as alternatives) is fit on those vectors in seconds and applied to every cached
patch, giving a per-class probability map. Connected components of that map become
**candidate detections** (point + box, and a rough mask). Because embeddings are cached,
"Train and Run" after the first pass is just refitting the head — fast enough to feel
interactive. For polygons, candidate boxes/points are turned into masks by SAM in CVAT
(phase 4).

---

## 4. Design

### 4.1 Data model (migration `103_machine_vision.sql`, new tables in `pgntarg2udzj1f3`)

All tables carry `lab_id` like the other root tables (see `nocodb-role-missing-lab-id-guc`
— creates must set it explicitly or the GUC must be fixed first).

- **`Vision_Jobs`** — one per vision Task. `task_id` (FK `Tasks`, unique), `mode`
  (`detection` | `segmentation`), `status` (`labeling` | `running` | `review` | `done`),
  `active_model_id`, `created_by`. Holds the wizard's choices.
- **`Vision_Classes`** — `job_id`, `name`, `color`, `sort_order`. Always an implicit
  `background` class (id stored, not user-deletable) — negatives are as important as
  positives for the head.
- **`Vision_Sources`** — what the job runs over: `job_id`, `kind` (`photo` | `basemap`),
  `upload_id` + `upload_table` (photos — mirrors `Task_Upload_Links`) or `basemap_id`,
  `embed_status` (`pending` | `ready` | `failed`), `embed_model` (e.g. `dinov3-vitl16`),
  `width`/`height`. Photos are synced from `Task_Upload_Links` when the job is created/edited.
- **`Vision_Labels`** — every training signal, one row each. `job_id`, `source_id`,
  `class_id`, `geom_kind` (`point` | `box` | `polygon`), `geom` JSONB in **pixel coords of the
  source** (photos and orthos alike — orthos also store `lon`/`lat` for points so imported GPS
  points round-trip), `origin` (`manual` | `gps_import` | `prediction_confirmed` |
  `prediction_rejected` | `cvat`), `created_by`.
- **`Vision_Models`** — one row per trained head: `job_id`, `version`, `head`
  (`knn` | `logreg` | `mlp`), `params` JSONB (k, threshold, …), `label_count`, `metrics`
  JSONB (leave-one-out / held-out accuracy per class), `artifact_path` (on Datamachine).
  A model can be reused by another job ("run from existing model" in the wizard).
- **`Vision_Runs`** — job runs, same shape as `Yield_Runs`/`PipelineRun`: `job_id`,
  `model_id`, `kind` (`embed` | `train_predict` | `predict`), `status`, `external_job_id`,
  `error_message`, `started_at`/`finished_at`.
- **`Vision_Predictions`** — `run_id`, `source_id`, `class_id`, `score`, `geom` JSONB
  (point + box, optional coarse polygon), `review` (`unreviewed` | `correct` | `incorrect`),
  `reviewed_by`. Marking one writes a `Vision_Labels` row (`prediction_confirmed` /
  `prediction_rejected` → labeled as `background`).

`Annotations` (CVAT output) gets two nullable columns, `vision_job_id` and `vision_source_id`,
so phase-4 boxes/polygons coming back from CVAT can be mirrored into `Vision_Labels`
(`origin = cvat`) without changing the existing CVAT flows.

### 4.2 PipelineProcessor — `vision` host job

New module `vision.py` + routes, copying the yield-clean pattern (configured-or-503, background
task, signed callback to `POST /api/vision-runs/webhook`):

- `POST /vision-runs/{id}/embed` — download each source (photo via `/api/files/photos/…`,
  ortho via the existing basemap-source download incl. S3 redirect), run DINOv3, write
  `embeddings/<source_id>.npy` (float16) + a patch-grid sidecar. **Orthos are tiled into
  overlapping chips** (e.g. 1024 px, 64 px overlap) at native GSD; chip patch grids are
  stitched back into one grid so a pixel ↔ patch lookup is a single index. Cache keyed by
  `(source sha256 / basemap sha256, embed_model)` so re-runs and other jobs on the same ortho
  reuse it.
- `POST /vision-runs/{id}/train-predict` — payload = labels (pixel geoms + class ids) +
  head choice. Map each label to patch vectors (point → its patch ±1 ring; box/polygon →
  patches inside; background labels likewise), fit the head, score every cached patch, threshold
  → connected components → predictions (centroid, bbox, coarse mask polygon, score). Write the
  model artifact (`Vision_Models.artifact_path`) and callback with predictions + metrics.
- `POST /vision-runs/{id}/predict` — apply an existing model to (new) sources.

Container: a fixed `visionkit` image (torch + DINOv3 code), **weights mounted read-only**
from a host dir (`VISION_WEIGHTS_DIR`), `--network none`, `--read-only`, `--tmpfs /tmp`,
**`--gpus all`** (only this job — the user-script sandbox stays GPU-less until that's decided
separately). Embedding is the only GPU-heavy step; train/predict on cached embeddings is CPU
numpy/scikit-learn and could run on the host venv, but keeping it in the same image is simpler.

Ortho sizing sanity check (to confirm on real data): a 2 GB, ~40k×40k px ortho at patch 16 →
~6.25 M patches; ViT-L features (1024-d, fp16) ≈ 12.8 GB on disk. Fine on Datamachine's
storage, but too big to hold in RAM for kNN — so for orthos either use **ViT-B/S** (768/384-d),
**PCA-reduce** to ~128-d at embed time (≈1.6 GB), or downsample the ortho to the GSD the
objects actually need. Pick per job: the wizard asks for "smallest object size" and we derive
the working GSD from it.

### 4.3 Heads

- **kNN (default)** — cosine distance on L2-normalized (optionally PCA'd) patch features,
  k≈5–15, with the background class as a first-class neighbor. No training step; works from
  ~5–10 labels per class; trivially explainable ("these were the nearest labeled patches").
  Use FAISS (CPU is fine) for millions of patches.
- **Logistic regression** — better calibrated scores and threshold once there are a few dozen
  labels per class; still trains in seconds.
- **Small MLP** — optional later, if logreg plateaus.

The UI shows the head + metrics per model version so users can compare runs.

### 4.4 Dashboard UI

- **New-task wizard** (Tasks › New Task, classification *image annotation* or *image
  classification*): sources (photo picker that already exists + a basemap picker), classes,
  mode (detection/segmentation), optional **training-points import** (CSV/GeoJSON with a class
  column → `Vision_Labels`, `origin = gps_import`, points outside the ortho footprint flagged),
  then the issue's fork: **Create preliminary data** vs **Run detection now** (from imported
  points, or pick an existing `Vision_Models` row).
- **Point-tagging view** (`/tasks/[id]/vision`), built in-house:
  - *Photos:* filmstrip + canvas; click to drop a point, pick class from a hotkey palette
    (1–9), right-click/Delete removes. Plain `<canvas>`/SVG over the image, pan/zoom.
  - *Orthos:* the existing map stack with the basemap's XYZ tiles; click drops a point,
    stored as both lon/lat and source pixel coords (via the basemap's geotransform, returned
    by the tiling job — **verify it's already stored; add to `Basemaps` if not**).
  - Per-class label counts + a **Finish labeling → Run** button (disabled until every class
    and background has ≥ N labels; N ≈ 5).
- **Review view** (phase 3): predictions overlaid on the same viewers + a **sortable gallery
  of crops** (lowest-confidence first, i.e. simple uncertainty sampling). Keyboard ✓ / ✗ per
  crop, "accept all above score X", re-label a crop to another class. **Train and Run** button
  refits on everything labeled so far. **Use as is** marks the job done and exposes outputs.
- **Outputs:** predictions as GeoJSON (orthos — becomes a farm-map overlay like other vector
  layers) or COCO JSON (photos), downloadable and readable via the Data Access API so Client
  scripts can pull them.

### 4.5 CVAT (phase 4)

- **"Refine in CVAT"** from the review view creates a CVAT task via `lib/cvat.ts` with:
  photos as-is, and for orthos **chips cut around predictions** (PipelineProcessor writes them;
  CVAT already fetches images by URL from `/api/files/…`, add a `vision-chips` path).
- Predictions are uploaded as **pre-annotations** (boxes for detection, points/boxes for
  segmentation) so annotators correct rather than draw from scratch; CVAT's **SAM** interactor
  (nuclio, on the CVAT host) turns point/box into polygons.
- The existing completion webhook already stores COCO shapes in `Annotations`; extend it to
  map chip coords back to source pixels and mirror into `Vision_Labels` (`origin = cvat`).
- Box/polygon labels feed the same patch-level head (patches inside = positive, a ring just
  outside = background), which sharpens object boundaries in the next run. Output boxes come
  from component bboxes; output polygons from the probability mask, optionally refined by SAM
  on Datamachine as a later improvement.

---

## 5. Open questions / to verify

1. **DINOv3 license + weights access** — DINOv3 ships under Meta's own DINOv3 license with
   gated downloads; confirm it's acceptable for lab research use and fetch weights onto
   Datamachine by hand (never into an image, same rule as the CNH plugin).
2. **Datamachine GPU** — model / VRAM, and whether nvidia-container-toolkit is installed (it
   also runs Ollama and Metashape — need a policy for contention: queue vision embeds, or run
   them only when Ollama is idle?).
3. **Backbone size** — ViT-S/B/L trade-off on real orthos (§4.2 sizing). Start ViT-B + PCA-128
   unless accuracy demands L.
4. **Basemap geotransform** — is the source raster's affine transform stored anywhere the
   Dashboard can read? Needed for exact lon/lat ↔ pixel on orthos.
5. **CVAT SAM** — is the nuclio SAM function deployed on our CVAT host? If not, phase 4
   polygons need it installed or a SAM endpoint on Datamachine.
6. **Lab scoping** — `Vision_Models` reuse across jobs: lab-scoped only (default), or shareable
   between labs?
7. **Photo groups** — is "linked to the task" enough grouping, or do photos need a standing
   group concept outside tasks (like Form/Sampling-Map groups)?

---

## 6. Phasing

| Phase | Scope | Repos | Done when |
|---|---|---|---|
| **1. Point tagging + tables** | Migration 103; new-task wizard vision step; photo + ortho point-tagging views; classes; GPS-points import; label counts. No ML yet. | Dashboard-UI | A user can create a vision task over photos and an ortho, tag points with classes, import field points, and see them persist. |
| **2. DINOv3 embed + kNN/logreg** | `--gpus` + nvidia toolkit on Datamachine; `visionkit` image; `/vision-runs/*` routes + embedding cache; Dashboard `Vision_Runs` + webhook; "Run" from the wizard / labeling view; predictions overlay. | PipelineProcessor, Dashboard-UI | Tagging ~10 points per class on a real ortho returns plausible predictions on the map. |
| **3. Review + retrain loop** | Review gallery (uncertainty-sorted), ✓/✗ → labels, Train and Run, model versions + metrics, Use as is, GeoJSON/COCO outputs + Data Access API route. | Dashboard-UI, PipelineProcessor | Two or three review rounds measurably improve precision on a held-out set; outputs downloadable. |
| **4. Boxes / polygons via CVAT** | Chips for orthos; pre-annotations; SAM in CVAT; webhook → `Vision_Labels`; box/polygon-aware head; box + polygon outputs. | Dashboard-UI, PipelineProcessor, CVAT host | Segmentation job produces polygons users only need to correct, and corrections feed the next run. |

Each phase is shippable on its own; phase 1 is useful even without ML (point labels exported as
training data). Migrations follow the usual rule: dev first, prod SQL handed to the user.

---

## Session log

**2026-11-20 — phase 2 built.**
- **User input:** GPU sharing isn't a concern for now (Ollama mostly runs at midnight; Metashape is a wildcard).
  Pixel↔coordinate mappings stay on the processor, not the Dashboard (so §5.4 is resolved that way: ortho labels
  are stored as lon/lat, and the processor converts them with the raster's own transform). User will install SAM
  on CVAT when phase 4 needs it.
- **Changed from §4.2:** there's no `visionkit` Docker image and no `--gpus`. Datamachine's Docker has no NVIDIA
  runtime and installing one needs sudo, so the worker runs as a host subprocess in its own CUDA venv
  (`~/vision-venv`, already installed). It's first-party code, the same trust model as yield cleaning. There's one
  route (`/vision-runs/{id}/run`: embed whatever isn't cached, then train and predict) instead of three; the cache
  makes re-runs fast anyway.
- **Ortho size, measured:** native-resolution embedding of a 1.9 cm, 870 MB ortho = 1.1 M patches in 31 s
  (stand-in model), PCA → 128-d = 290 MB cache. The 8 M-patch cap auto-coarsens bigger orthos.
- **DINOv3 weights:** gated on Hugging Face (401 without a token); not downloaded yet. Tested end-to-end with
  DINOv2-small as a stand-in. Note `facebook/dinov3-vitl16-pretrain-sat493m` (satellite-pretrained) as a
  candidate for orthos alongside the default `dinov3-vitb16-pretrain-lvd1689m`.
- **DINOv3 downloaded** (later the same day, user granted access): `dinov3-vitb16-pretrain-lvd1689m` (327 MB) and
  `dinov3-vitl16-pretrain-sat493m` (1.2 GB) in Datamachine `~/models/dinov3/`. On basemap 1 with 20 greenness
  labels, the satellite ViT-L got 90–100% held-out label accuracy vs 60–80% for ViT-B (embed 59 s vs 39 s;
  retrain 13–15 s vs 5–6 s), so it's now the processor's default for any run that includes an ortho
  (`VISION_ORTHO_MODEL`); ViT-B stays the default for photo-only runs.
- **Open:** no pruning of the embedding cache; phase 1 tagging view; deploy (migration 103 on prod, processor
  `.env` `VISION_PYTHON=/home/fdl/vision-venv/bin/python`).
