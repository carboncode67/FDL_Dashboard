-- Links Custom Forms to Sampling Maps: one optional Form per Sampling_Map (set from the map
-- editor's toolbar), so every point on that map -- existing/planned or created ad hoc in the
-- field via the bearer API -- can be filled out against the same form. A Form_Responses row
-- optionally ties back to the Sampling_Point it was collected at; submitting the linked form at
-- a point is treated as "collecting" it (app-side also logs a Sampling_Point_Collections row).
--
-- Sampling_Points.content_hash is new too, backing dedup for field-created points the same way
-- Photos/Notes/Sampling_Point_Collections already dedup client-computed submissions -- only ever
-- set for placement_method = 'field'; the web editor's drawn/generated/uploaded points never
-- send one.

ALTER TABLE "pgntarg2udzj1f3"."Sampling_Maps"
  ADD COLUMN IF NOT EXISTS form_id INT REFERENCES "pgntarg2udzj1f3"."Forms"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sampling_maps_form ON "pgntarg2udzj1f3"."Sampling_Maps"(form_id);

ALTER TABLE "pgntarg2udzj1f3"."Sampling_Points"
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_sampling_points_hash ON "pgntarg2udzj1f3"."Sampling_Points"(content_hash);

ALTER TABLE "pgntarg2udzj1f3"."Form_Responses"
  ADD COLUMN IF NOT EXISTS sampling_point_id INT REFERENCES "pgntarg2udzj1f3"."Sampling_Points"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_form_responses_sampling_point ON "pgntarg2udzj1f3"."Form_Responses"(sampling_point_id);
