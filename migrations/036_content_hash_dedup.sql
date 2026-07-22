-- Content-hash-based duplicate-upload detection for the mobile apps.
-- content_hash is a SHA-256 computed on-device at creation time (raw file
-- bytes for photos/recordings, canonical content string for notes/locations)
-- and sent by the client. Dedup is app-level via findFirst, not a DB
-- constraint -- same pattern as the existing ticket_ref column.

ALTER TABLE "pgntarg2udzj1f3"."Photos"             ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE "pgntarg2udzj1f3"."Recordings"         ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE "pgntarg2udzj1f3"."Notes"              ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE "pgntarg2udzj1f3"."Locations"          ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE "pgntarg2udzj1f3"."Lab_Member_Uploads" ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_photos_content_hash
  ON "pgntarg2udzj1f3"."Photos"(content_hash);
CREATE INDEX IF NOT EXISTS idx_recordings_content_hash
  ON "pgntarg2udzj1f3"."Recordings"(content_hash);
CREATE INDEX IF NOT EXISTS idx_notes_content_hash
  ON "pgntarg2udzj1f3"."Notes"(content_hash);
CREATE INDEX IF NOT EXISTS idx_locations_content_hash
  ON "pgntarg2udzj1f3"."Locations"(content_hash);
CREATE INDEX IF NOT EXISTS idx_lab_member_uploads_content_hash
  ON "pgntarg2udzj1f3"."Lab_Member_Uploads"(content_hash);
