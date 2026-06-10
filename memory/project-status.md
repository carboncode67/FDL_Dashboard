---
name: project-status
description: Current completion state of Planned Changes.md steps and active work in progress
metadata:
  type: project
---

Planned Changes.md tracks 5 steps for the OFE Dashboard-UI. As of 2026-06-02:

- [x] Step 1 — Database migration: PostgreSQL now runs inside the Docker container (confirmed live: 4 Projects, 10 Farms, 2 Fields, 1 Lab Member, 2 Contacts). DB at localhost:5433, schema `pgntarg2udzj1f3` fully populated.
- [x] Step 2 — Lab member/farmer user distinction + proximity-based farm assignment: implemented via `Contacts.is_lab_member` boolean and `resolveFarmId()` proximity logic.
- [~] Step 3 pre-work DONE — Lab members can now receive QR codes independently of Contacts. Data they upload goes to `Lab_Member_Uploads` table (unified, all media types). Status auto-set on upload (1=Unassigned, 2=Farm Matched). Step 3 itself (adding status flag to farmer uploads too) is still open.
- [ ] Step 4 — Data Sorting UI (lab-member-only access to sort Lab_Member_Uploads, set status=3)
- [ ] Step 5 — Data Access API

**Why:** Migration to containerized DB confirmed by direct psql query. Lab member pre-work required separate token column on Lab Members table and new unified uploads table.

**How to apply:** Before suggesting DB architecture changes, the DB is fully self-contained in Docker. No NocoDB connection remains active — NocoDB column registration is no longer needed for new columns.
