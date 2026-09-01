-- "Pull spatial context" feature: per-farm environmental rasters (soil, terrain,
-- drought, ...) fetched from the ScienceVersa GeoDaRT API. A lab member triggers a
-- pull from the farm detail page; an in-process node-cron sweep polls the GeoDaRT
-- job, downloads the resulting COG zip, and stores each raster under
-- DATA_DIR/context/ served via /api/files/context/<filename>.
-- Additive-only, safe to re-run.

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Context_Fetch_Jobs" (
  id                 SERIAL PRIMARY KEY,
  farm_id            INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Farms"(id) ON DELETE CASCADE,
  requested_by       TEXT REFERENCES "public"."users"(id) ON DELETE SET NULL,
  products           TEXT[] NOT NULL DEFAULT '{}',      -- ['POLARIS','USGS3DEP_10m','USDroughtMonitor']
  start_date         DATE NOT NULL,
  end_date           DATE NOT NULL,
  buffer_m           DOUBLE PRECISION NOT NULL DEFAULT 150,
  aoi                JSONB NOT NULL,                    -- the [[lon,lat],...] ring actually sent to GeoDaRT
  export_format      TEXT NOT NULL DEFAULT 'COG',
  status             TEXT NOT NULL DEFAULT 'pending',   -- pending | submitted | running | success | partial | failed
  progress           INT NOT NULL DEFAULT 0,
  geodart_job_id     TEXT,
  geodart_request_id TEXT,
  product_results    JSONB NOT NULL DEFAULT '{}',       -- { POLARIS:{ok:true}, Sentinel2:{ok:false,error:"..."} }
  error_message      TEXT,
  claimed_at         TIMESTAMPTZ,                       -- optimistic lock for the cron sweep
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at       TIMESTAMPTZ,
  finished_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_context_fetch_jobs_status ON "pgntarg2udzj1f3"."Context_Fetch_Jobs"(status);
CREATE INDEX IF NOT EXISTS idx_context_fetch_jobs_farm ON "pgntarg2udzj1f3"."Context_Fetch_Jobs"(farm_id);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Context_Rasters" (
  id            SERIAL PRIMARY KEY,
  job_id        INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Context_Fetch_Jobs"(id) ON DELETE CASCADE,
  farm_id       INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Farms"(id) ON DELETE CASCADE,
  product       TEXT NOT NULL,
  band_names    TEXT[] NOT NULL DEFAULT '{}',
  start_date    DATE,
  end_date      DATE,
  capture_date  DATE,                                   -- actual scene date for time-varying products (parsed from filename)
  filename      TEXT NOT NULL,                          -- flat basename under DATA_DIR/context/
  bytes         BIGINT NOT NULL,
  sha256        TEXT NOT NULL,
  footprint     JSONB NOT NULL,                         -- GeoJSON Polygon of the requested AOI bbox
  crs           TEXT,
  pixel_size_m  DOUBLE PRECISION,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_context_rasters_job ON "pgntarg2udzj1f3"."Context_Rasters"(job_id);
CREATE INDEX IF NOT EXISTS idx_context_rasters_farm_product ON "pgntarg2udzj1f3"."Context_Rasters"(farm_id, product);
CREATE UNIQUE INDEX IF NOT EXISTS uq_context_rasters_job_filename ON "pgntarg2udzj1f3"."Context_Rasters"(job_id, filename);
