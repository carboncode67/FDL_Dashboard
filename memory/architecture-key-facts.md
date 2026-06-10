---
name: architecture-key-facts
description: Critical architecture facts about the OFE Dashboard-UI that are non-obvious and easy to forget
metadata:
  type: project
---

**Database:**
- PostgreSQL runs inside the Docker container (port 5433 on host, 5432 internally)
- Credentials: user=nocodb, password=teddyboy, db=nocodb
- All experiment data in schema `pgntarg2udzj1f3` (not `public`)
- `public` schema: only `users` (NextAuth) and NocoDB internal metadata

**NocoDB rules (critical):**
- Never drop `_nc_m2m_*` junction tables via SQL
- Any new column added via SQL must also be registered in `public.nc_columns_v2` with `base_id = 'pgntarg2udzj1f3'` and `source_id = 'bw8u74ygq5uhtnh'`
- New tables created via SQL won't appear in NocoDB until you trigger a sync from NocoDB Data Sources UI

**Upload auth (separate from NextAuth):**
- Mobile app uses Bearer token stored in `Contacts.token` (32-byte hex)
- `lib/upload-auth.ts` authenticates via `Contacts` table — NOT the `public.users` table
- All upload routes (`app/api/upload/{photo,recording,note,location}`) require `export const runtime = "nodejs"`

**Contact vs Lab Member distinction:**
- `Contacts.is_lab_member = true` → lab member upload access (GPS proximity assigns farm)
- `Contacts.is_lab_member = false` → farmer (linked to a specific farm via `farms_id`)
- `pgntarg2udzj1f3."Lab Members"` is the personnel directory — separate table, different purpose

**UI component note:**
- `components/ui/` uses `@base-ui/react` (NOT Radix UI)
- No `asChild` prop — use `render` prop instead: `<DialogTrigger render={<Button />}>`

**Prisma:**
- Must use Prisma 6 (not 7) — Prisma 7 broke `datasource` config for this setup
- `multiSchema` preview feature must stay in the generator block
