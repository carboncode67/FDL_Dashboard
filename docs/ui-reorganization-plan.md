# UI Reorganization plan

Scoping doc for the 6-item "UI Reorganization" section of `../Planned Changes.md`. All 6 items are sidebar/navigation restructuring only — no schema, API, or permission changes (see decision log below for the one access-control question this raised and how it was resolved).

Everything here touches `components/sidebar.tsx` (single source of truth for both the desktop sidebar and `components/mobile-nav.tsx`, which renders the same `<Sidebar>`) plus two new landing pages.

## Decision log

- **Item 3 (moving 4 items "down to ADMIN")**: confirmed with the user this is a **visual regrouping only**, not new access control. None of the 4 pages (Activity Report, Data Categories, Lab Members, Messaging) gain a role check; they stay reachable and usable by `member`/`viewer` exactly as today. This matters because the sidebar's existing "Admin" section is `role === "admin"`-gated (hides from the nav, does not block the route) — that gate is **not** reused for these 4 items. Instead a new always-rendered "Admin" heading is added, with the existing admin-only "Admin Panel"/"Pipelines" links appended inside it conditionally, so the heading is shared but only those two links keep their role gate.
- **Item 2 ("Change Data Sorting to 'Incoming Data'")**: treated as a **label-only** rename. Route stays `/data-sorting`, and all internal naming (`data-sorting-client.tsx`, the "Data Sorting" feature name throughout `CLAUDE.md`, the `Data_Sorting`-adjacent status-code docs) is left alone — only the nav `label` string and the page's own visible heading change. Renaming the route/internal name would be a much bigger, purely-cosmetic ripple for no functional benefit; flag if a full rename was actually wanted.

## Current nav (`components/sidebar.tsx`)

```
Data Management: Dashboard, Farmers, Lab Members, Data Sorting, Data Categories, Messaging, Activity Report, Custom Forms, Geofences
Field Operations: Projects, Tasks, Farms, Experiments, Fields, Experiment Zones, Sampling Maps
Reference Data: Treatment Types, Tests, Equipment, Drone Flights, Crops, Task Templates, Methodologies, Data Tables
Admin (role === "admin" only): Admin Panel, Pipelines
```

## Target nav

```
Data Management: Dashboard, Farmers, Incoming Data, Projects, Send to Mobile App
Field Operations: Tasks, Farms, Experiments, Experiment Zones, Inventory
Reference Data: Treatment Types, Crops, Task Templates, Methodologies, Data Tables
Admin (always visible heading): Activity Report, Data Categories, Lab Members, Messaging
  + (role === "admin" only, inside same section): Admin Panel, Pipelines
```

`Send to Mobile App` and `Inventory` are new single nav entries that route to new landing pages, not dropdowns — matches the "opens a sub page" wording in item 1 rather than an expandable tree (there's no existing nested-nav pattern in this codebase to extend).

## Per-item changes

**1. "Send to Mobile App" landing page**
- New route `app/(dashboard)/send-to-mobile-app/page.tsx` — plain server component, no data fetch needed. Three `Link`-wrapped `Card` tiles (reusing `components/ui/card.tsx`, same primitives as the dashboard home page) to `/sampling-maps`, `/geofences`, `/forms`, each with its existing sidebar icon (`Crosshair`, `MapPin`, `FileText`) and a one-line description.
- Sidebar: remove `Geofences` and `Custom Forms` rows from `dataNav`, remove `Sampling Maps` from `fieldOpsNav`; add one `{ href: "/send-to-mobile-app", label: "Send to Mobile App", icon: Smartphone }` row to `dataNav`. The three underlying routes/pages are untouched — still directly linkable, just no longer top-level sidebar entries.

**2. Data Sorting → Incoming Data**
- `dataNav` row: `label: "Data Sorting"` → `label: "Incoming Data"`. `href: "/data-sorting"` unchanged.
- Cosmetic follow-up: the page's own `<h1>`/heading text in `data-sorting-client.tsx` should probably say "Incoming Data" too for consistency (nav label and page title currently match everywhere else in the app) — will confirm the exact heading text while implementing.

**3. Activity Report, Data Categories, Lab Members, Messaging → Admin**
- Remove these 4 rows from `dataNav`.
- Replace the single conditionally-rendered Admin `<div>` block in `sidebar.tsx` with: an always-rendered "Admin" heading containing the 4 moved items, followed by `Admin Panel` and `Pipelines` still wrapped in `{role === "admin" && ...}` inside the same block. No changes to `proxy.ts`, no new role checks on the 4 pages — see decision log.

**4. Remove Fields from sidebar**
- Delete the `Fields` row from `fieldOpsNav`. `app/(dashboard)/fields/*` and `app/api/fields/*` stay as-is (per item text) — still reachable from farm/field detail links (e.g. draw-field flows) and the Data Access API.

**5. Projects → Data Management**
- Move the `Projects` row from `fieldOpsNav` to `dataNav`.

**6. "Inventory" submenu (Tests, Equipment, Drone Flights)**
- New route `app/(dashboard)/inventory/page.tsx`, same tile pattern as item 1, linking to `/tests`, `/drones`, `/drones/flights` with their existing icons (`TestTube`, `Plane`, `Plane`).
- Sidebar: remove those 3 rows from `referenceNav`; add `{ href: "/inventory", label: "Inventory", icon: Boxes }` to `fieldOpsNav` (grouped with the other field-operations tile menu, "Send to Mobile App", per item 6's "similar to the Send to Mobile App submenu" wording).

## New icons needed

`Smartphone` and `Boxes` from `lucide-react` (already a project dependency, no install needed) for the two new tile-menu nav rows.

## Files touched

- `components/sidebar.tsx` — nav arrays + Admin block restructuring (both desktop sidebar and mobile nav pick this up automatically, no separate change to `components/mobile-nav.tsx`)
- `app/(dashboard)/send-to-mobile-app/page.tsx` — new
- `app/(dashboard)/inventory/page.tsx` — new
- `app/(dashboard)/data-sorting/data-sorting-client.tsx` — heading text only (pending confirmation)

No migration, no API route changes, no `proxy.ts` changes — every existing route keeps its current path, session-auth behavior, and role permissions; this is purely nav restructuring plus two new thin landing pages.
