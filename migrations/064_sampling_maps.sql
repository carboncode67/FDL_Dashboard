-- Planned Changes item 4: "Create maps" — sampling maps built from a basemap, one or more
-- polygons, and sampling points placed on them (manually, or later generated randomly/on a
-- grid — that generation logic is client-side math, no schema needed for it).
--
-- Sampling_Maps is farm-scoped (required farm_id) with an optional experiment_id: a map can
-- either be a general farm sampling map or scoped to one Farm_Experiments row. Only an
-- experiment-scoped map lets its points link to that experiment's Experiment_Tests (a Test is
-- a global methodology; Experiment_Tests is the per-experiment instance that actually gets
-- sampled, so that's what a point should reference, not Tests directly).
--
-- Sampling_Map_Polygons is a child table (not one geometry column on the map) because a map
-- can hold multiple polygons — a boundary plus, later, strata for conditioned-Latin-Hypercube
-- or stratified sampling (see Planned Changes item 4's parenthetical; not built yet). A polygon
-- can be hand-drawn or imported from an existing Fields/Experiment_Zones boundary, tracked via
-- source_field_id/source_zone_id for provenance.
--
-- Sampling_Points references a polygon (nullable — which stratum it was generated in) and an
-- Experiment_Tests row (nullable — "linked to tests"). geometry is a GeoJSON Point in TEXT,
-- matching the existing Fields.geometry/Experiment_Zones.geometry convention rather than plain
-- lat/lng columns, so a point could later carry a buffer/sample-area polygon without a schema
-- change.

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Sampling_Maps" (
  id            SERIAL PRIMARY KEY,
  farm_id       INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Farms"(id) ON DELETE CASCADE,
  experiment_id INT REFERENCES "pgntarg2udzj1f3"."Farm_Experiments"(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  created_by_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sampling_maps_farm ON "pgntarg2udzj1f3"."Sampling_Maps"(farm_id);
CREATE INDEX IF NOT EXISTS idx_sampling_maps_experiment ON "pgntarg2udzj1f3"."Sampling_Maps"(experiment_id);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Sampling_Map_Polygons" (
  id               SERIAL PRIMARY KEY,
  sampling_map_id  INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Sampling_Maps"(id) ON DELETE CASCADE,
  label            TEXT,
  purpose          TEXT NOT NULL DEFAULT 'boundary',
  geometry         TEXT NOT NULL,
  source           TEXT NOT NULL DEFAULT 'drawn',
  source_field_id  INT REFERENCES "pgntarg2udzj1f3"."Fields"(id) ON DELETE SET NULL,
  source_zone_id   INT REFERENCES "pgntarg2udzj1f3"."Experiment_Zones"(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sampling_map_polygons_map ON "pgntarg2udzj1f3"."Sampling_Map_Polygons"(sampling_map_id);

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Sampling_Points" (
  id                 SERIAL PRIMARY KEY,
  sampling_map_id    INT NOT NULL REFERENCES "pgntarg2udzj1f3"."Sampling_Maps"(id) ON DELETE CASCADE,
  polygon_id         INT REFERENCES "pgntarg2udzj1f3"."Sampling_Map_Polygons"(id) ON DELETE SET NULL,
  experiment_test_id INT REFERENCES "pgntarg2udzj1f3"."Experiment_Tests"(id) ON DELETE SET NULL,
  label              TEXT,
  geometry           TEXT NOT NULL,
  placement_method   TEXT NOT NULL DEFAULT 'manual',
  sample_index       INT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sampling_points_map ON "pgntarg2udzj1f3"."Sampling_Points"(sampling_map_id);
CREATE INDEX IF NOT EXISTS idx_sampling_points_polygon ON "pgntarg2udzj1f3"."Sampling_Points"(polygon_id);
CREATE INDEX IF NOT EXISTS idx_sampling_points_test ON "pgntarg2udzj1f3"."Sampling_Points"(experiment_test_id);
