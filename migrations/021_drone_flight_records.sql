-- Migration 021: Individual drone flight records and polygon feature storage
-- Safe to re-run (IF NOT EXISTS throughout)

SET search_path TO "pgntarg2udzj1f3";

-- Individual flight records, children of Experiment_Drone_Flights planned assignments
CREATE TABLE IF NOT EXISTS "Drone_Flight_Records" (
  id                         SERIAL PRIMARY KEY,
  experiment_drone_flight_id INTEGER NOT NULL REFERENCES "Experiment_Drone_Flights"(id) ON DELETE CASCADE,
  flight_date                DATE,
  pilot                      TEXT,
  flight_status              VARCHAR(50) DEFAULT 'Scheduled',
  -- Acquisition metadata
  total_acres                DECIMAL(10, 2),
  total_images               INTEGER,
  -- Processing flags
  needs_3d                   BOOLEAN NOT NULL DEFAULT FALSE,
  needs_ortho                BOOLEAN NOT NULL DEFAULT FALSE,
  processed                  BOOLEAN NOT NULL DEFAULT FALSE,
  -- Path to imagery on zraid array (not stored in DB)
  data_storage_path          TEXT,
  -- Random tile generation settings for AI annotation
  tile_coverage_pct          DECIMAL(5, 2),
  tile_size_m                DECIMAL(8, 2),
  notes                      TEXT,
  created_at                 TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Polygon features from annotation/segmentation workflows (future UI, table created now)
CREATE TABLE IF NOT EXISTS "Drone_Flight_Polygons" (
  id               SERIAL PRIMARY KEY,
  flight_record_id INTEGER NOT NULL REFERENCES "Drone_Flight_Records"(id) ON DELETE CASCADE,
  label            TEXT,
  polygon_type     VARCHAR(50),  -- 'feature_tag', 'segmented_feature', 'ai_annotation'
  geometry         TEXT,         -- GeoJSON string
  confidence       DECIMAL(5, 4),
  source           VARCHAR(50),  -- 'human', 'ai'
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
