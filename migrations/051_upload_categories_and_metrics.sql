-- Moves upload categories (previously a hardcoded list in data-sorting-client.tsx)
-- into the DB so they can be managed from a UI screen, and adds per-category
-- "metrics" (e.g. Grazing Measurement -> Height) that can be filled in on an
-- upload once a category is assigned. Additive-only, safe to re-run.

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Upload_Categories" (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  -- Which item.media_type values ("photo" | "note" | "recording" | "location")
  -- this category applies to. Empty array = applies to every type (wildcard).
  media_types TEXT[] NOT NULL DEFAULT '{}',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Category_Metrics" (
  id SERIAL PRIMARY KEY,
  category_id INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Upload_Categories"(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text', -- text | number | select | boolean
  unit TEXT,
  options JSONB, -- array of strings, only used when field_type = 'select'
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_category_metrics_category ON "pgntarg2udzj1f3"."Category_Metrics"(category_id);

-- Values are stored generically against any of the five upload tables via
-- (upload_table, upload_id) rather than a direct FK, matching the existing
-- Annotations / Task_Upload_Links pattern for cross-table upload references.
CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Upload_Metric_Values" (
  id SERIAL PRIMARY KEY,
  upload_table TEXT NOT NULL,
  upload_id INT NOT NULL,
  metric_id INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Category_Metrics"(id) ON DELETE CASCADE,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (upload_table, upload_id, metric_id)
);

CREATE INDEX IF NOT EXISTS idx_upload_metric_values_upload ON "pgntarg2udzj1f3"."Upload_Metric_Values"(upload_table, upload_id);

-- Seed the categories that were previously hardcoded, so existing sorted
-- data keeps working with the same names. "Other" is shared by both the
-- general and recording pickers, so it gets the wildcard (applies to all).
INSERT INTO "pgntarg2udzj1f3"."Upload_Categories" (name, media_types, sort_order) VALUES
  ('Biomass Sample',            '{photo,note,location}', 0),
  ('Grazing Measurement',       '{photo,note,location}', 1),
  ('Plant ID',                  '{photo,note,location}', 2),
  ('Implement',                 '{photo,note,location}', 3),
  ('Equipment Model Number',    '{photo,note,location}', 4),
  ('Chemical Label',            '{photo,note,location}', 5),
  ('Soil Sample',               '{photo,note,location}', 6),
  ('Pest / Disease',            '{photo,note,location}', 7),
  ('Harvest',                   '{photo,note,location}', 8),
  ('Planting',                  '{photo,note,location}', 9),
  ('App Test',                  '{photo,note,location}', 10),
  ('Animal',                    '{photo,note,location}', 11),
  ('Product',                   '{photo,note,location}', 12),
  ('Crop Metric',               '{photo,note,location}', 13),
  ('Onboarding Interview',      '{recording}',           14),
  ('Voice Memo',                '{recording}',           15),
  ('Other',                     '{}',                    16)
ON CONFLICT (name) DO NOTHING;

-- Example metric definitions for the two categories called out by name in
-- the feature request, so the UI has something to show immediately. Guarded
-- with NOT EXISTS (rather than ON CONFLICT, since there's no unique
-- constraint on category_id+label) so re-running this file doesn't duplicate them.
INSERT INTO "pgntarg2udzj1f3"."Category_Metrics" (category_id, label, field_type, unit, sort_order)
SELECT c.id, 'Height', 'number', 'in', 0
FROM "pgntarg2udzj1f3"."Upload_Categories" c
WHERE c.name = 'Grazing Measurement'
AND NOT EXISTS (
  SELECT 1 FROM "pgntarg2udzj1f3"."Category_Metrics" m WHERE m.category_id = c.id AND m.label = 'Height'
);

INSERT INTO "pgntarg2udzj1f3"."Category_Metrics" (category_id, label, field_type, options, sort_order)
SELECT c.id, 'Growth Stage', 'select',
  '["VE","V1","V2","V3","V4","V5","V6","VT","R1","R2","R3","R4","R5","R6"]'::jsonb, 0
FROM "pgntarg2udzj1f3"."Upload_Categories" c
WHERE c.name = 'Crop Metric'
AND NOT EXISTS (
  SELECT 1 FROM "pgntarg2udzj1f3"."Category_Metrics" m WHERE m.category_id = c.id AND m.label = 'Growth Stage'
);
