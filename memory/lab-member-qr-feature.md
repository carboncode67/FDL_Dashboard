---
name: lab-member-qr-feature
description: Completed implementation giving lab members independent app upload access and a unified uploads table
metadata:
  type: project
---

Pre-work for Step 3 of Planned Changes.md — COMPLETED as of 2026-06-02.

**Design decision:** Lab Members and Contacts remain completely separate tables. Lab Members get their own `token` column and auth path — no FK link between the tables.

**What was built:**

DB:
- `migrations/002_lab_member_token_and_uploads.sql` applied to live container DB
- `token VARCHAR(64)` added to `pgntarg2udzj1f3."Lab Members"`
- New table `pgntarg2udzj1f3."Lab_Member_Uploads"` with columns: id, lab_member_id, farm_id, media_type, filename, content, latitude, longitude, gps_filename, start_time, end_time, date_collected, status (1/2/3), received_at
- Prisma schema updated; `npx prisma generate` run successfully

Auth:
- `lib/upload-auth.ts` now returns `{ kind: "contact"; contact } | { kind: "labMember"; labMember } | { error }` (kind discriminant, not optional-never — the optional-never approach caused TS errors)
- Checks Contacts table first, then Lab Members table

Upload routes (all 4: photo, recording, note, location):
- `auth.kind === "labMember"` → write to `Lab_Member_Uploads`, use `resolveFarmIdForLabMember(lat, lng)`
- `auth.kind === "contact"` → existing behavior unchanged (write to Photos/Recordings/Notes/Locations)
- Status auto-set: `farm_id == null` → status 1 (Unassigned); `farm_id != null` → status 2 (Farm Matched)

New API routes:
- `POST /api/lab-members/[id]/token` — generates 32-byte hex token, stores it, invalidates previous
- `GET /api/lab-members/[id]/qr` — returns QR data URL; 404 if no token yet

UI changes:
- Lab Members list: "App Access" column (Active badge / None badge); row click → detail page
- `lab-members/[id]/page.tsx` — detail page with QR display or "Grant App Access" button
- `lab-members/[id]/grant-access-button.tsx` — client button, calls POST token route, then `router.refresh()`
- `lab-members/[id]/qr-display.tsx` — fetches from `/api/lab-members/[id]/qr`
- New `/lab-uploads` page — unified table: Uploaded By, Assigned Farm, Media Type, Date Collected, Status
- Sidebar: "Lab Uploads" added to Field Operations nav

**Status labels:** 1 = Unassigned, 2 = Farm Matched, 3 = Sorted (3 set by future Data Sorting UI in Step 4)

**Why:** GPS proximity already assigns farm_id for lab member uploads. Status 3 is reserved for Step 4 (Data Sorting UI).

**How to apply:** When implementing Step 4, the sorting UI should PATCH `Lab_Member_Uploads.status` to 3 and allow adding category/description. The `lab-uploads` page is the entry point for this flow.
