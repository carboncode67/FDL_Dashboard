-- OFE Dashboard -> FDB one-way sync of Custom Forms and Sampling Maps, so a
-- map a farmer builds (and assigns) in OFE reaches the mobile apps, which only
-- ever read FDB. OFE pushes a whole-map / whole-form snapshot to
-- /api/data/ofe/{forms,sampling-maps}/[ofeId] (service account only); FDB
-- upserts it in place, keyed by these ofe_id columns, so FDB row ids stay
-- stable across re-pushes (phone responses and collections reference
-- Sampling_Points.id).
--
-- ofe_id NOT NULL marks a row as OFE-owned: read-only in this dashboard (the
-- web edit routes refuse it, the list pages show it in its own section) and
-- deleted here when OFE deletes it. Form field definitions need no ofe_id --
-- OFE's field_key values ("f_<random>") are copied verbatim, so
-- Form_Responses.data is keyed identically on both sides.
--
-- Points/polygons are unique per map, not globally: a point created on a
-- phone (placement_method = 'field') has ofe_id NULL until OFE pulls it back
-- and assigns one on its next push.
--
-- Safe to re-run: IF NOT EXISTS throughout.

ALTER TABLE "pgntarg2udzj1f3"."Forms" ADD COLUMN IF NOT EXISTS ofe_id INT;
CREATE UNIQUE INDEX IF NOT EXISTS "Forms_ofe_id_key"
  ON "pgntarg2udzj1f3"."Forms"(ofe_id);

ALTER TABLE "pgntarg2udzj1f3"."Sampling_Maps" ADD COLUMN IF NOT EXISTS ofe_id INT;
CREATE UNIQUE INDEX IF NOT EXISTS "Sampling_Maps_ofe_id_key"
  ON "pgntarg2udzj1f3"."Sampling_Maps"(ofe_id);

ALTER TABLE "pgntarg2udzj1f3"."Sampling_Map_Polygons" ADD COLUMN IF NOT EXISTS ofe_id INT;
CREATE UNIQUE INDEX IF NOT EXISTS "Sampling_Map_Polygons_sampling_map_id_ofe_id_key"
  ON "pgntarg2udzj1f3"."Sampling_Map_Polygons"(sampling_map_id, ofe_id);

ALTER TABLE "pgntarg2udzj1f3"."Sampling_Points" ADD COLUMN IF NOT EXISTS ofe_id INT;
CREATE UNIQUE INDEX IF NOT EXISTS "Sampling_Points_sampling_map_id_ofe_id_key"
  ON "pgntarg2udzj1f3"."Sampling_Points"(sampling_map_id, ofe_id);

-- Maps sent from OFE are mostly worked by farmers on their QR-code (Contact)
-- login, which until now could view a map but not drop points, submit at a
-- point, or mark one collected. Collections were keyed by user only.
ALTER TABLE "pgntarg2udzj1f3"."Sampling_Point_Collections"
  ADD COLUMN IF NOT EXISTS contact_id INT
  REFERENCES "pgntarg2udzj1f3"."Contacts"(id) ON DELETE SET NULL;
