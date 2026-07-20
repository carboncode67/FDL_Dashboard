# FDL Platform — Dashboard UI

Web-based management dashboard for the On-Farm Experiment (OFE) Pipeline. A small agricultural research lab (~5–15 users) uses this to track field experiments across Projects, Farms, Fields, Treatments, Drones, and Lab Members. It also serves as the backend server that the [FarmerDataLogger](../FarmerDataLogger/) mobile app syncs data to.

## Purpose

The dashboard provides:

- **Experiment management** — create and track Projects, Farms, Fields, Experiment Zones, Treatments, Treatment Protocols, and Tests through a browser UI
- **Field data aggregation** — receives photos, audio recordings, GPS tracks, and notes uploaded from the mobile app in the field
- **Contact & onboarding management** — generates QR codes that farmers scan to onboard the mobile app with a server URL and bearer token
- **Overview metrics** — a home dashboard showing active projects, enrolled farms, total experiment zone acreage, and upcoming tests

All data is stored in a shared PostgreSQL database co-managed with NocoDB for spreadsheet-style access.

## Tech Stack

- **Next.js 16** (App Router, server components + client components)
- **Prisma 6** (ORM, multi-schema, PostgreSQL)
- **NextAuth v5** (JWT sessions, credentials provider)
- **Tailwind CSS** + **shadcn/ui** (base-ui/react components)
- **Docker** for containerized deployment

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL at `10.0.1.10:5432` (or configure `DATABASE_URL`)
- A `.env.local` file (see Environment Variables below)

### Install and run

```bash
npm install
npx prisma generate   # generate Prisma client from schema
npm run dev           # dev server on :3000
```

Open [http://localhost:3000](http://localhost:3000). The bootstrap account `admin@lab.com` / `admin123` works when the `public.users` table is empty.

### Other commands

```bash
npm run build         # production build
npm run lint          # ESLint check
npx prisma db pull    # sync schema from live DB (overwrites local schema — use carefully)
```

## Environment Variables

Create a `.env.local` file (never commit it):

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Yes | Random secret for JWT signing |
| `NEXTAUTH_URL` | Yes | Public URL of this server (e.g. `http://localhost:3000`) |
| `DATA_DIR` | Yes | Directory where uploaded files are stored (defaults to `./upload-data`) |
| `FARMER_SERVER_URL` | No | URL encoded in farmer QR codes — defaults to `NEXTAUTH_URL`. Set this when the container's external port differs from 3000. |

## Features & Routes

### Dashboard (`/`)

Home page showing:
- Active project count with status breakdown badges
- Enrolled farm count
- Total experiment zone area (acres, computed from GeoJSON geometry)
- Experiment zone count
- Upcoming tests in the next 30 days
- Per-project zone and acreage table
- Upcoming test schedule table

### Projects (`/projects`)

Full CRUD for research projects. Each project has a name, sponsors, budget, year started, and status (`Planning`, `Active`, `Complete`, `On Hold`). Detail page shows associated Farms and Lab Members via many-to-many relationships.

### Farms (`/farms`)

Full CRUD for farm records (name, farmer contact, county, state). Detail page lists associated Fields and linked Projects. A GPS tracks panel shows location data uploaded from the mobile app.

### Fields (`/fields`)

Full CRUD for individual fields within a farm. Fields have a geometry column (GeoJSON polygon, populated by ingestion scripts — read-only in the UI via a Leaflet map panel). Detail page shows linked Crops, Drones, and Tests.

### Experiment Zones (`/experiment-zones`)

Full CRUD for treatment/experiment zones within fields. Geometry is read-only (set by ingestion scripts). Each zone links to a Project and a Farm.

### Treatments (`/treatments`)

Full CRUD for individual treatments (e.g. fertilizer rates, seed varieties) that are applied within an experiment.

### Treatment Protocols (`/treatment-protocols`)

Full CRUD for protocol definitions that group ordered treatments within a Project.

### Tests (`/tests`)

Full CRUD for lab/field tests. Each test has a planned date, cost, sample count, and can be linked to multiple Fields.

### Crops (`/crops`)

Full CRUD for crop records. Crops can be linked to Fields.

### Drones (`/drones`)

Full CRUD for drone records (model, FAA registration, certification status). Drones can be linked to Fields.

### Lab Members (`/lab-members`)

Full CRUD for lab personnel (name, position, contact info, FAA Part 107 status). Lab Members are linked to Projects via a many-to-many join.

### Contacts (`/contacts`)

Manages farmer contacts for the FarmerDataLogger mobile app. Each contact has a bearer token used for mobile upload authentication.

- **New contact**: Generates a random 32-byte hex token automatically
- **QR code** (`/contacts/[id]`): Displays a scannable QR code encoding `{ url, token }` — farmers scan this to onboard the mobile app

> Note: Contacts created through NocoDB directly will have an empty token and cannot onboard the mobile app.

### Users (`/users`)

Basic user management for dashboard login accounts.

## API Routes

### CRUD endpoints (dashboard mutations)

Each entity has a REST API used by client-side forms:

| Route | Methods |
|---|---|
| `/api/projects` | GET, POST |
| `/api/projects/[id]` | GET, PUT, DELETE |
| `/api/projects/[id]/farms` | GET, POST, DELETE |
| `/api/projects/[id]/lab-members` | GET, POST, DELETE |
| `/api/farms` | GET, POST |
| `/api/farms/[id]` | GET, PUT, DELETE |
| `/api/farms/[id]/projects` | GET |
| `/api/farms/[id]/gps-tracks` | GET |
| `/api/fields` | GET, POST |
| `/api/fields/[id]` | GET, PUT, DELETE |
| `/api/fields/[id]/crops` | GET, POST, DELETE |
| `/api/fields/[id]/drones` | GET, POST, DELETE |
| `/api/fields/[id]/tests` | GET, POST, DELETE |
| `/api/experiment-zones` | GET, POST |
| `/api/experiment-zones/[id]` | GET, PUT, DELETE |
| `/api/treatments` | GET, POST |
| `/api/treatments/[id]` | GET, PUT, DELETE |
| `/api/treatment-protocols` | GET, POST |
| `/api/treatment-protocols/[id]` | GET, PUT, DELETE |
| `/api/tests` | GET, POST |
| `/api/tests/[id]` | GET, PUT, DELETE |
| `/api/crops` | GET, POST |
| `/api/crops/[id]` | GET, PUT, DELETE |
| `/api/drones` | GET, POST |
| `/api/drones/[id]` | GET, PUT, DELETE |
| `/api/lab-members` | GET, POST |
| `/api/lab-members/[id]` | GET, PUT, DELETE |
| `/api/contacts` | GET, POST |
| `/api/contacts/[id]` | GET, PUT, DELETE |
| `/api/contacts/[id]/qr` | GET — returns QR code data URL |

### Mobile upload endpoints

Accept multipart or JSON from the FarmerDataLogger mobile app. Auth: `Authorization: Bearer <token>` (token looked up against `Contacts` table).

| Route | Description |
|---|---|
| `POST /api/upload/photo` | Saves photo file to `DATA_DIR/photos/`, inserts row in `Photos` table |
| `POST /api/upload/recording` | Saves audio file to `DATA_DIR/recordings/`, inserts row in `Recordings` table |
| `POST /api/upload/note` | Inserts text note in `Notes` table |
| `POST /api/upload/location` | Saves GeoJSON GPS track to `DATA_DIR/locations/`, inserts row in `Locations` table |

### File serving

`GET /api/files/[type]/[filename]` — Serves uploaded files from `DATA_DIR`. Valid types: `photos`, `recordings`, `locations`. Filenames are validated with `path.basename` to prevent directory traversal.

## Database

PostgreSQL at `10.0.1.10:5432`, database `nocodb`, user `nocodb`.

- **Experiment data** lives in schema `pgntarg2udzj1f3`
- **Auth data** (`users`) lives in the `public` schema
- NocoDB co-manages experiment tables — never drop `_nc_m2m_*` junction tables via SQL; remove relationships through the NocoDB UI instead

## Deployment

### Docker (production)

```bash
# Build and push to local registry
docker buildx build --platform linux/amd64 -t 10.0.1.3:30095/fdl-server:latest --push .

# docker-compose.yml is gitignored (it ends up holding a real DB password).
# First time only: cp sample_compose.yaml docker-compose.yml
docker-compose up -d
```

`docker-compose.yml` (copied from `sample_compose.yaml`) expects the following environment variables to be set (via `.env` or shell):

```
POSTGRES_PASSWORD
DATABASE_URL
NEXTAUTH_SECRET
NEXTAUTH_URL
DATA_DIR
FARMER_SERVER_URL   # optional, defaults to NEXTAUTH_URL
```

The multi-stage Dockerfile runs `prisma generate` and `next build` in the builder stage and produces a minimal runtime image using Next.js `output: "standalone"`.
