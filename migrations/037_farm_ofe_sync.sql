-- Lets a lab member opt a specific farm into syncing with OFE Dashboard.
-- OFE's sync job (Farm/Field/Experiment/ExperimentFieldZone) only picks up
-- farms flagged here; nothing is synced automatically otherwise.
ALTER TABLE "pgntarg2udzj1f3"."Farms" ADD COLUMN IF NOT EXISTS ofe_sync_enabled BOOLEAN NOT NULL DEFAULT false;
