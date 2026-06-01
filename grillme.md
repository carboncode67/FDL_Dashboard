# UI Design Interview

Questions are asked sequentially — each batch depends on answers to the previous.
Format answers inline after each question.

---

## Round 1 — Audience & Deployment (gates everything else)

**Q1. Who uses this app, and how many people?**
> My recommendation: Sounds like a small research lab (5–15 people). Confirm.
Answer: yes

**Q2. Is this internal-only (lab network / VPN) or does it need to be accessible from anywhere?**
> My recommendation: Internal + accessible from anywhere via a simple login. Field researchers need access on-site.
Answer: Internal/vpn

**Q3. Does it need authentication / user accounts, or is it a trusted-network tool (no login)?**
> My recommendation: Yes — at minimum a single shared password or individual accounts. Data integrity matters for research.
Answer: needs users and authentication

**Q4. Where will this be hosted? (same server as NocoDB at 10.0.1.10, a cloud VM, Vercel/Netlify, etc.)**
> My recommendation: Same server as NocoDB for simplicity. Docker container alongside it.
Answer: For now, on my nas, though it needs to be portable so it can be deployed on the lab server once complete

---

## Round 2 — Stack & Data Access (mutually dependent)

**Q5. Frontend framework — how comfortable are you (or contributors) with JavaScript/TypeScript?**
Options: (a) Next.js full-stack — one repo, built-in API routes, easiest auth integration; (b) SvelteKit — lighter, faster, slightly smaller ecosystem; (c) React + Vite (frontend only) + separate Express API.
> My recommendation: **Next.js (App Router)**. It handles SSR, API routes, and auth in one repo, Docker-builds cleanly, and has the widest ecosystem for the data-heavy UI you'll need. Unless you have a strong Svelte preference, Next.js is the path of least resistance.
Answer: Lets go with next.js, it will be a good learning experience

**Q6. Data access layer — talk to the DB directly, or go through the NocoDB REST/GraphQL API?**
Options: (a) Direct PostgreSQL via Prisma or Drizzle ORM — full control, type-safe queries, handles geometry well; (b) NocoDB REST API — less setup, but you're limited to what NocoDB exposes (no raw SQL, awkward for geometry aggregations).
> My recommendation: **Direct PostgreSQL via Prisma**. NocoDB is great as a spreadsheet-style admin panel but its API will be a bottleneck the moment you need area sums from geometry fields or any join-heavy query. Talk to the DB directly; keep NocoDB as a data-entry fallback.
Answer: direct db connection

**Q7. Authentication — who manages users, and what's the login experience?**
Options: (a) NextAuth.js (credentials provider) — username/password stored in your DB, no external dependency; (b) NextAuth + Google OAuth — lab members log in with Google accounts; (c) Simple JWT rolled by hand.
> My recommendation: **NextAuth credentials + a `users` table in your DB**. No external OAuth dependency, works on VPN, easy to add users by inserting a row. Add Google OAuth later if wanted.
Answer: keep it simple, just nextauth

**Q8. Do different users need different permissions? (e.g., read-only field technicians vs. admin lab managers)**
> My recommendation: Yes — at least two roles: `admin` (full CRUD) and `viewer` (read-only). Simple role column on the users table.
Answer:  lets start with just admin.

---

## Round 3 — Layout & Navigation

**Q9. Overall shell — sidebar nav or top nav?**
Options: (a) Persistent left sidebar with entity names (Projects, Farms, Fields…) — standard data-app pattern, easy to scan; (b) Top nav bar with dropdowns; (c) Dashboard-first with big cards/buttons as the only nav.
> My recommendation: **Left sidebar + top header bar**. Sidebar lists the main entities; header shows the logged-in user and a logout button. This is the pattern every researcher will immediately recognize from tools like Notion, Linear, or Airtable.
Answer: go with your rec

**Q10. What is the landing page (after login)?**
Options: (a) A stats dashboard — project count, total field area, active experiments at a glance; (b) A "home" page with big launch buttons for each entity (Projects, Farms, etc.); (c) Drop straight into the Projects list.
> My recommendation: **Stats dashboard home**. A quick overview (# active projects, total enrolled farm area, upcoming test dates) gives the app immediate value beyond raw CRUD. The entity lists are one sidebar click away.
Answer: Go with your rec

**Q11. What are the top-level nav items (sidebar entries)?**
Draft list based on the schema — mark any you'd remove, rename, or reorder:
1. Dashboard (home/stats)
2. Projects
3. Farms
4. Fields
5. Lab Members
6. Treatments
7. Treatment Protocols
8. Experiment Zones
9. Tests
10. Drones
11. Crops
> My recommendation: Keep all of them. Group into two sections: **"Field Operations"** (Projects, Farms, Fields, Experiment Zones, Treatment Protocols) and **"Reference Data"** (Treatments, Tests, Drones, Crops, Lab Members).
Answer: go with your rec

**Q12. How do you navigate from one entity to a related one? (e.g., from a Project, can you click into its Farms?)**
Options: (a) Linked fields — click a farm name inside a project record and it opens that farm's detail page; (b) Separate pages only — no cross-linking, user navigates manually; (c) Nested tabs — a Project detail page has tabs for its Farms, Experiment Zones, Treatment Protocols.
> My recommendation: **Nested tabs on detail pages** for the most-used relationships (Project → Farms, Protocols, Zones; Farm → Fields). Click-through links for simpler lookups (e.g., a field's crop list). This mirrors how researchers actually think about the data.
Answer: your rec

---

## Round 4 — CRUD Patterns (apply to all entities)

**Q13. Form presentation — when creating or editing a record, how does the form appear?**
Options: (a) **Slide-over panel** — form slides in from the right, list stays visible behind it; (b) **Modal dialog** — centered overlay, good for short forms; (c) **Full dedicated page** — navigate away from list to a /projects/new route.
> My recommendation: **Slide-over for create/edit, full detail page for viewing a record.** Slide-overs keep context (you can still see the list), and a dedicated detail page makes sense for records with nested tabs (Projects, Farms). Modals are fine for simple reference data (Crops, Drones).
Answer:

**Q14. List views — table with pagination, or infinite scroll? And do you need column sorting + text search on list pages?**
> My recommendation: **Paginated table (25 rows/page), with column header sorting and a search bar per list page.** These datasets won't be huge but sorting by date, farm name, etc. will be used constantly.
Answer:

**Q15. Geometry input — how do users enter polygon data for Fields and Experiment Zones?**
Options: (a) **Paste GeoJSON or WKT** into a text area — simple, works if users already have the geometry from a GPS/GIS tool; (b) **File upload** (GeoJSON or Shapefile) — practical, most farm boundary data lives in files; (c) **Draw on a map** (Leaflet Draw) — most intuitive but highest complexity to build; (d) (b) + map preview after upload — best of both.
> My recommendation: **(d) File upload (GeoJSON) + map preview after upload.** Farm boundaries already exist as files from GPS units or QGIS. Drawing on a web map is rarely how field researchers create boundaries. The preview confirms the upload is correct. Save geometry as GeoJSON string in the DB column for now; add PostGIS proper type later.
Answer: This will be handled by an api automation, skip geometry creation for now, but consider a geometry visualization window

**Q16. Dashboard stats — which of these KPIs do you want on the home screen? Add, remove, or rename.**
Draft list:
- Active Projects (count, with status badge breakdown)
- Enrolled Farms (count)
- Total Field Area (sum of all field geometries, in acres)
- Experiment Zones (count)
- Upcoming Tests (tests with Planned_Date in the next 30 days)
- Recent Activity (last 5 records created/modified — any table)
> My recommendation: **All of the above except Recent Activity for now** — it requires an audit log. The five metric cards + a simple table of upcoming tests is a clean, useful first dashboard.
Answer: All

---

## Round 5 — Primary Entity Design (Projects, Farms, Fields)

### Projects

**Q17. Projects list view — which columns appear in the table?**
> My recommendation: Project Name, Status (badge), Year Started, Total Budget, # Farms (count), # Experiment Zones (count). Sortable by name, status, year.
Answer: 

**Q18. Project Status field — free text, or a fixed dropdown of values?**
> My recommendation: **Dropdown** with values: Planning, Active, Complete, On Hold. Consistent values make the dashboard status badge breakdown meaningful.
Answer:

**Q19. Project detail page tabs — what tabs appear when you open a project?**
> My recommendation: **Overview** (all project fields) | **Farms** (linked farms, add/remove) | **Lab Members** (linked members, add/remove) | **Treatment Protocols** (list of protocols for this project, create new) | **Experiment Zones** (list of zones for this project, with map visualization).
Answer:

---

### Farms

**Q20. Farms list view — which columns appear in the table?**
> My recommendation: Farm Name, Farmer Name, County, State, # Fields (count), # Projects (count). Sortable by name, county, state.
Answer:

**Q21. Farm detail page tabs?**
> My recommendation: **Overview** (all farm fields) | **Fields** (list of fields with geometry map, add new) | **Projects** (linked projects) | **Experiment Zones** (zones on this farm).
Answer:

---

### Fields

**Q22. Fields list view — which columns appear?**
> My recommendation: Field Name, Farm (linked), Boundary Source, Has Geometry (yes/no indicator). Sortable by name, farm.
Answer:

**Q23. Field detail page — since geometry input is skipped, what does the geometry section look like?**
> My recommendation: A read-only **Leaflet map panel** showing the polygon if geometry exists, otherwise a placeholder ("Geometry pending — set via API"). Below that: linked Tests, Crops, Drones in tabs.
Answer:

**Q24. Field detail page tabs?**
> My recommendation: **Overview + Map** (fields + geometry visualization) | **Tests** (scheduled tests for this field) | **Crops** (planted crops, M2M) | **Drone Flights** (drones, M2M).
Answer:
