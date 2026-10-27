# Form & Sampling Map groups in the FarmerDataLogger apps — scoping

**Status:** scoping only, nothing built app-side. The server half is done (2026-10-27).
**Related:** migration `087_farm_tags_and_item_groups.sql`, `lib/item-groups.ts`.

## What exists on the server

- Forms and Sampling Maps each have their **own, separate** flat group list
  (`Form_Groups`, `Sampling_Map_Groups`; lab-scoped, `sort_order` + `name`). An item is in
  at most one group; `group_id NULL` = Ungrouped.
- Groups are created, renamed, reordered and deleted on the web list pages ("Groups" button,
  `canEdit`), and items are moved with the per-row "Group" picker. There is no app-side
  editing, and this plan doesn't add any.
- **API contract (already live):** both bearer list endpoints now include a nullable `group`
  object on each item. It's additive, and both apps already ignore unknown keys (Swift
  `JSONDecoder` by default; Kotlin `Json { ignoreUnknownKeys = true }` in `FormsService.kt`
  and `SamplingMapsService.kt`), so nothing breaks before the apps adopt it:

  ```jsonc
  // GET /api/data/forms         → [{ id, title, …, group: { id, name, sort_order } | null }]
  // GET /api/data/sampling-maps → [{ id, name, …, group: { id, name, sort_order } | null }]
  ```

  The ids are unique per kind only, so a form group and a map group can share an id. Always
  key by (kind, id).

Farm tags are **not** going to the apps. They're a web-dashboard view filter only.

## Proposed app work (same shape on Swift and Kotlin)

1. **Decode.** Add `group: ItemGroupRef?` (`id`, `name`, `sortOrder`) to `FormSummary` /
   the sampling-map summary model.
2. **Cache.** Add `group_id INTEGER`, `group_name TEXT` and `group_sort INTEGER` (all
   nullable) to the cached rows, so the grouped list also works offline:
   - Swift: `form_defs` and `sampling_map_defs`, using `DatabaseManager.swift`'s existing
     guarded `ALTER TABLE … ADD COLUMN` pattern (the same one used for `basemap_json` /
     `form_id`).
   - Kotlin: `FormDefEntity` / `SamplingMapDefEntity`, as a Room migration from version 9 to
     10 in `AppDatabase.kt`.

   Denormalised on purpose: there's no group endpoint to sync, and groups are read-only on the
   phone. The list-sync upserts (`upsertFormDefsFromList` and equivalents) write these columns;
   the per-form schema path must keep not touching them.
3. **Render.**
   - Swift: `FormsListView` / `SamplingMapsListView` switch from a flat `ForEach` to one
     `Section` per group (order by `group_sort`, then name; "Ungrouped" last), with
     `Section(isExpanded:)` for collapsing (iOS 17+, already the minimum).
   - Kotlin: `FormsListScreen` / `SamplingMapsListScreen` get sticky headers in the
     `LazyColumn`, with a chevron to collapse.
   - Hide the headers entirely when nothing is grouped, so labs that never use groups see
     today's list unchanged.
4. **Collapse memory.** Per-device, stored in `UserDefaults` / `DataStore`, keyed by
   `forms:<groupId>` and `maps:<groupId>`. It isn't synced with the web's localStorage state.

Rough size: about a day per app, with no server changes.

## Open questions

- **Sampling maps on the phone are also implicitly per-farm.** If the lists ever group by farm
  as well, decide whether farm or group is the outer level. Group-then-farm matches the web.
- **Proximity auto-prompt and geofence "fill form" sheets** pick a form or map directly; they
  should ignore groups (nothing to organise in a one-item prompt).
- If a lab later wants app users to *choose* which groups sync (e.g. only "Silage harvesting"
  during harvest), that's a separate feature. It would need a filter on the list endpoints,
  not just display.
