-- WhatsApp + activity-reporting integration (merged from fork).
-- Idempotent: safe to re-run against both Postgres instances.
SET search_path = pgntarg2udzj1f3;

-- 1. Human-readable OFEDashBot reference on existing upload tables.
ALTER TABLE "Photos"     ADD COLUMN IF NOT EXISTS ticket_ref TEXT;
ALTER TABLE "Recordings" ADD COLUMN IF NOT EXISTS ticket_ref TEXT;
ALTER TABLE "Notes"      ADD COLUMN IF NOT EXISTS ticket_ref TEXT;
ALTER TABLE "Locations"  ADD COLUMN IF NOT EXISTS ticket_ref TEXT;

-- 2. Extend the existing Documents table into the unified model.
--    Existing rows are dashboard uploads; inbound WhatsApp documents set source='whatsapp'.
ALTER TABLE "Documents" ADD COLUMN IF NOT EXISTS source     TEXT NOT NULL DEFAULT 'dashboard';
ALTER TABLE "Documents" ADD COLUMN IF NOT EXISTS contact_id INTEGER REFERENCES "Contacts"(id) ON DELETE SET NULL;
ALTER TABLE "Documents" ADD COLUMN IF NOT EXISTS note       TEXT;
ALTER TABLE "Documents" ADD COLUMN IF NOT EXISTS category   VARCHAR(100);
ALTER TABLE "Documents" ADD COLUMN IF NOT EXISTS "timestamp" TIMESTAMPTZ;
ALTER TABLE "Documents" ADD COLUMN IF NOT EXISTS status     INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "Documents" ADD COLUMN IF NOT EXISTS ticket_ref TEXT;

-- 3. Inbound WhatsApp video messages.
CREATE TABLE IF NOT EXISTS "Videos" (
  id          SERIAL PRIMARY KEY,
  contact_id  INTEGER REFERENCES "Contacts"(id)  ON DELETE SET NULL,
  farm_id     INTEGER REFERENCES "Farms"(id)     ON DELETE SET NULL,
  project_id  INTEGER REFERENCES "Projects"(id)  ON DELETE SET NULL,
  filename    TEXT NOT NULL,
  latitude    DOUBLE PRECISION,
  longitude   DOUBLE PRECISION,
  note        TEXT,
  "timestamp" TIMESTAMPTZ,
  status      INTEGER NOT NULL DEFAULT 2,
  ticket_ref  TEXT,
  category    VARCHAR(100),
  description TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Inbound WhatsApp shared contact cards (vCards).
CREATE TABLE IF NOT EXISTS "WhatsApp_Contact_Cards" (
  id           SERIAL PRIMARY KEY,
  contact_id   INTEGER REFERENCES "Contacts"(id) ON DELETE SET NULL,
  farm_id      INTEGER REFERENCES "Farms"(id)    ON DELETE SET NULL,
  shared_name  TEXT NOT NULL,
  shared_phone TEXT,
  shared_email TEXT,
  shared_org   TEXT,
  note         TEXT,
  status       INTEGER NOT NULL DEFAULT 2,
  ticket_ref   TEXT,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Activity-report email subscriptions (driven by lib/scheduler.ts).
CREATE TABLE IF NOT EXISTS "Reporting_Subscriptions" (
  id           SERIAL PRIMARY KEY,
  label        TEXT NOT NULL,
  emails       TEXT NOT NULL,                 -- semicolon-separated
  frequency    TEXT NOT NULL DEFAULT 'weekly',-- weekly | biweekly | monthly
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  contact_ids  TEXT NOT NULL,                 -- JSON array of contact IDs
  last_sent_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
