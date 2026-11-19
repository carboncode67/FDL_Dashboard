# "Unprocessable data" flag (GitHub issue #3)

Status: live on production since 2026-11-19 (Dashboard-UI 39a5d04, Client 79a2c0e +
481e5b7). Migration 102 has been run on TrueNAS dev and production. The nightly
Data Sleuth run (`agents-run.timer` on the Datamachine) is enabled.

## What it does

When someone uploads data the lab has a tool for (a CNH yield card, a CSV that
matches a test template, anything a live pipeline matches), it gets processed.
When the upload is data but nothing covers it (a soil lab report PDF, for
example), it gets an **Unprocessable data** flag. The flag shows up on Data
Sorting and on the dashboard home page, so someone either builds a tool for it
or dismisses it as one-off data.

## Who decides what

| Step | Who | Where |
|---|---|---|
| "What kind of data is this?" | Data Sleuth, pass 1 (observe) | `Agent_Observations.data_product`, fixed list in `lib/data-products.ts` (mirrored in `Client/agents/shared/tools.py`) |
| "Does a tool cover it?" | Dashboard, deterministic | `lib/processing-gaps.ts` `coveringTool()` |
| Open / resolve / remove the flag | Dashboard | `evaluateGap()` → `Processing_Gaps` |
| Dismiss, or "never flag this type" | A person | `/api/processing-gaps/*` |

The agent never sees the pipeline list and never writes a flag itself. At worst,
an injected file can cause one false flag on that one upload.

## Rules (`evaluateGap`)

A flag is **open** when all of these hold:

1. The upload is sorted: `status >= 3` or it has a category. Pipelines only match
   after sorting, so an unsorted yield file isn't flagged.
2. Its current observation has a `data_product` other than `none`.
3. The type isn't on the lab's ignore list (`Processing_Gap_Ignores`).
4. No tool covers it:
   - no live pipeline matches its table, category, project and Data Table (`findMatchingLivePipelines()`, the same query the trigger uses),
   - no non-failed pipeline run used it,
   - for documents: no yield run used it as its source, and no Data Table template matched it (`data_table_id`).

When a tool appears, an open flag becomes **resolved**. If that tool goes away,
the flag re-opens. A **dismissed** flag is never re-opened automatically, so a
dismissal survives re-observation. If an upload stops qualifying (un-sorted,
re-observed as `none`, or its type is ignored), its open or resolved flag is
deleted.

Upload tables covered: photos, notes, lab_member_uploads, documents (the
observable upload tables, minus form_responses).

## When it runs

- `writeObservation()`: after every agent observation write.
- `PATCH /api/uploads/[table]/[id]` and `PATCH /api/data/uploads/[table]/[id]`: when status, category or project changes.
- `PATCH` / `DELETE /api/pipelines/[id]` and the pipelines webhook's `pipeline_registered` event: re-evaluates every open or resolved flag in the pipeline's lab (`reevaluateGaps`, capped at 5000).

Every hook is best-effort. A failure is logged and never fails the write that
triggered it.

## UI

- **Data Sorting list:** an "Unprocessable" badge, and an "Unprocessable (N)" filter button (`?unprocessable=1`, kept through prev/next on the detail page).
- **Detail page:** `unprocessable-card.tsx` shows the type, the agent's observation as plain text, and buttons:
  - **Dismiss** (admin or member, with an optional reason).
  - **Never flag "<type>"** (admin): adds a lab-wide ignore and dismisses every open flag of that type.
  - **Re-open** on a dismissed flag.
- **Login notice:** `components/unprocessable-banner.tsx` on the dashboard home page shows the counts by type and a Review link. A count also appears next to "Incoming Data" in the sidebar. Both show only to roles that can edit. There's no per-user read state: the notice goes away once the flags are dismissed or resolved.
- **Admin Panel → Agents:** the ignored types, with **Stop ignoring**. Flags that the ignore dismissed stay dismissed.

## Agent side (Client/agents)

- `read_document` broker tool: fetches a document or a lab-member document and parses it in `broker/extract.py`, a child process with a 30 s timeout and a 1 GB address-space cap. Detection is by magic bytes:

  | Content | Extracted |
  |---|---|
  | PDF | text of the first 8 pages |
  | Scanned PDF | page 1 rendered, re-sanitized by `sanitize_image` |
  | docx | paragraph text |
  | xlsx | 40 rows × 30 columns of up to 5 sheets |
  | zip | entry listing only, with a bomb guard |
  | images | handed to the image sanitizer |
  | UTF-8 text | the text |
  | legacy Office | reported as unsupported |

  Files over the Dashboard's 25 MB agent-files cap are observed from their metadata.
- The observe prompt and JSON schema gain `data_product`. Changing the prompt changes `OBSERVE_PROMPT_SHA`, so the next observe run re-observes every upload once.
- Broker image adds `pypdf==5.1.0`, `pypdfium2==4.30.0` and `openpyxl==3.1.5`.

## Tests

- `scripts/verify-processing-gaps.ts`: 13 lib-level checks against the local DB (open, resolve, re-open, dismissal persistence, `none`, template coverage, re-classify, ignore, un-sort). Run instructions are in the file header.
- Extractor: run against PDF, scanned PDF, docx, xlsx, CSV, zip, zip bomb, broken PDF and random binary.

## Deploy order (production)

All done 2026-11-19:

1. Run `migrations/102_processing_gaps.sql` on TrueNAS dev and production. The layout's sidebar count fails soft without it, but Data Sorting and the admin page need it.
2. Deploy the Dashboard-UI image.
3. Restage `Client/agents` on the Datamachine. `setup-agents-host.sh` rebuilds the broker image with the new dependencies; its header has the tar/scp/setup commands.
4. Do a dry run by hand (`./agents.sh once --dry-run observe --limit 5 --tables …`), then go live. Going live means the drop-in `agents-run.service.d/live.conf` (`Environment=AGENT_RUN_FLAGS=`) plus `systemctl --user enable --now agents-run.timer`, as the `agents` user. See `Client/CLAUDE.md` → Agents sandbox.

Flags open after each night's observe run (01:00, up to 300 uploads). The prompt change re-observes every upload once, so with a large backlog the first flags take a few nights to all appear.

### Found during rollout

The first Datamachine dry run printed "nothing to observe" for every photo and
note, and described form responses as empty. The cause: the runner read fields
off `get_row`'s `{table, agent_authored, row}` envelope instead of `.row`, so
pass 1 never fetched any content. This dated from pass 1's first version; it had
never been seen because prod had only had dry runs. Fixed in Client 481e5b7 with
`Sleuth.record()`. Skip lines now give the reason, e.g. `nothing to observe —
no content and no record fields`.

## Not built

- Turning a group of flags into an `Agent_Analysis_Specs` request ("we keep getting soil reports").
- Email digest of new flags.
- form_responses, recordings, locations and videos aren't covered.
