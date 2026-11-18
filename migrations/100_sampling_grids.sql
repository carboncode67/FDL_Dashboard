-- Sampling grids: the record of a grid used for randomized grid sampling
-- (Cartographer skill "grid sampling", lib/geo-grid.ts, docs/cartographer-agent-plan.md §4a).
--
-- A grid is stored as numbers, not geometry: a CRS (WGS84 / UTM), an origin,
-- a cell size and a rotation. That's enough to recreate every cell exactly in
-- any GIS for later analysis; `seed` + `params.algorithm` also reproduce the
-- random point in each cell. Points sampled from a grid point back at it
-- (grid_id + grid_col/grid_row), so analysis can group by cell.
--
-- Child of Sampling_Maps (no own lab_id), RLS via the parent like
-- Sampling_Points / Sampling_Map_Polygons (071). Additive, safe to re-run.

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Sampling_Grids" (
  id                SERIAL PRIMARY KEY,
  sampling_map_id   INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Sampling_Maps"(id) ON DELETE CASCADE,
  label             TEXT,
  crs               TEXT NOT NULL,                 -- e.g. EPSG:32618 (WGS84 / UTM 18N)
  origin_x          DOUBLE PRECISION NOT NULL,     -- SW corner of cell (0,0), CRS metres
  origin_y          DOUBLE PRECISION NOT NULL,
  origin_lat        DOUBLE PRECISION,              -- the same origin in WGS84, for convenience
  origin_lng        DOUBLE PRECISION,
  cell_size_m       DOUBLE PRECISION NOT NULL,
  rotation_deg      DOUBLE PRECISION NOT NULL DEFAULT 0,  -- clockwise from the CRS's grid north
  method            TEXT NOT NULL DEFAULT 'random_in_cell',
  seed              INT,                           -- 0 … 2^31−1
  params            JSONB NOT NULL DEFAULT '{}'::jsonb,   -- algorithm, polygons, buffer, sizing, dropped cells…
  agent_draft_id    INT REFERENCES "pgntarg2udzj1f3"."Agent_Geometry_Drafts"(id) ON DELETE SET NULL,
  created_by_id     TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sampling_grids_map ON "pgntarg2udzj1f3"."Sampling_Grids"(sampling_map_id);

ALTER TABLE "pgntarg2udzj1f3"."Sampling_Points" ADD COLUMN IF NOT EXISTS grid_id INT
  REFERENCES "pgntarg2udzj1f3"."Sampling_Grids"(id) ON DELETE SET NULL;
ALTER TABLE "pgntarg2udzj1f3"."Sampling_Points" ADD COLUMN IF NOT EXISTS grid_col INT;
ALTER TABLE "pgntarg2udzj1f3"."Sampling_Points" ADD COLUMN IF NOT EXISTS grid_row INT;
CREATE INDEX IF NOT EXISTS idx_sampling_points_grid ON "pgntarg2udzj1f3"."Sampling_Points"(grid_id);

-- A draft carries the grid records it would create (applied together with its points).
ALTER TABLE "pgntarg2udzj1f3"."Agent_Geometry_Drafts" ADD COLUMN IF NOT EXISTS grids JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  EXECUTE $sql$ALTER TABLE "pgntarg2udzj1f3"."Sampling_Grids" ENABLE ROW LEVEL SECURITY$sql$;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Sampling_Grids' AND policyname = 'tenant_isolation') THEN
    EXECUTE $sql$CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Sampling_Grids" USING ("sampling_map_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Sampling_Maps")) WITH CHECK ("sampling_map_id" IN (SELECT id FROM "pgntarg2udzj1f3"."Sampling_Maps"))$sql$;
  END IF;
END $$;
