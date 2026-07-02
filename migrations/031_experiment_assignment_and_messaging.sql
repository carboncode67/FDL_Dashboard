-- Migration 031: Experiment assignment, messaging channels, message templates,
-- onboarding tracking
--
-- Applied locally via `prisma db push` during the session of 2026-07-02.
-- This file documents those changes for production deployment and for any
-- developer setting up a fresh database from the migration history rather
-- than from schema.prisma directly.
--
-- Run this against the production database BEFORE deploying the application
-- code from commit dd06555.

-- 1. New columns on Contacts
--    assigned_experiment_id: links a farmer to one of their farm's experiments.
--    experiment_nickname: farmer-facing label shown in message receipts instead
--      of the internal experiment name.
--    channel: preferred messaging channel, either 'whatsapp' or 'sms'.
--    onboarded_at: timestamp of when the onboarding message was sent. Null
--      means not yet onboarded. Channel-agnostic, shared across WhatsApp and SMS.

ALTER TABLE pgntarg2udzj1f3."Contacts"
  ADD COLUMN IF NOT EXISTS assigned_experiment_id INTEGER
    REFERENCES pgntarg2udzj1f3."Farm_Experiments"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS experiment_nickname TEXT,
  ADD COLUMN IF NOT EXISTS channel VARCHAR,
  ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

-- 2. New table: MessageTemplates
--    Stores reusable canned messages for the Messaging admin page.
--    Global, not scoped to a user or project.

CREATE TABLE IF NOT EXISTS pgntarg2udzj1f3."MessageTemplates" (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. SiteConfig row for the onboarding message
--    The application reads this via getOnboardingMessage() in
--    lib/onboarding-message.ts. If no row exists, the hardcoded
--    DEFAULT_ONBOARDING_MESSAGE in that file is used as the fallback,
--    so this INSERT is optional for production. It is included here so
--    the value is explicit in the migration history rather than invisible.
--
--    Edit the value below to match the current IRB-approved onboarding text
--    before running this migration, or leave it out and set it via the
--    Admin Panel after deployment.

INSERT INTO public.site_config (key, value)
VALUES (
  'onboarding_message',
  'This number is monitored weekly — not suitable for urgent matters.

Welcome to the Farmers Datalab! Use this number to document your on-farm experiment — send observations, photos, voice notes, videos, soil reports, location pins, or any other field data.

Please avoid sending sensitive personal or financial information (IDs, banking details, passwords).

By using this service you acknowledge that WhatsApp and Twilio process messages as part of their infrastructure. We do not share your data with any other party.

Your participation is voluntary. Reply with your name to get started.'
)
ON CONFLICT (key) DO NOTHING;
