-- Planned Changes #13 (map survey results interaction).
--
-- 1. "Download Responses" CSV needs x/y/z position + GPS accuracy + external-GPS on each
--    Form_Responses row. The Swift client already sends lat/lng/fix_quality/h_accuracy on every
--    submission (see swift/CLAUDE.md's precise-GNSS section) but POST /api/data/forms/[id]/
--    responses only ever read lat/lng to resolve farm_id and discarded the rest -- this is the
--    server-side follow-up that section called out. altitude is new on every side (no client,
--    Swift or Kotlin, captures it yet) -- column added now so ingestion needs no second
--    migration once a client sends it; rows without it stay NULL ("z position" blank in the CSV).
--    fix_quality is nullable text, not an enum, matching the client's GNSSFixQuality.storageKey
--    convention (kept as freeform string on Photos/Notes/Sampling_Point_Collections client-side
--    too -- no server enum to keep in sync with future fix-quality cases).
--
--    external_gps is a separate boolean, NOT derived from fix_quality: GNSSFix(coreLocation:)
--    reports quality = "autonomous" for the phone's own fix, and an external Emlid receiver
--    with no RTK correction yet reports that exact same "autonomous" value -- fix_quality alone
--    can't tell the two apart. The real signal is LocationManager.usingExternalReceiver
--    (fix.source == .external), which the client doesn't send yet -- new field, sent alongside
--    fix_quality/h_accuracy once FormFillView is updated (see swift scope).
--
-- 2. Proximity auto-popup needs one setting per map (not per point -- simplest first version,
--    matches how form_id is already a single map-level setting rather than living on each
--    point). NULL/0 means the feature is off for that map.

ALTER TABLE "pgntarg2udzj1f3"."Form_Responses"
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS altitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS h_accuracy DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS fix_quality TEXT,
  ADD COLUMN IF NOT EXISTS external_gps BOOLEAN;

ALTER TABLE "pgntarg2udzj1f3"."Sampling_Maps"
  ADD COLUMN IF NOT EXISTS proximity_radius_m DOUBLE PRECISION;
