-- Add upload token to Lab Members
ALTER TABLE pgntarg2udzj1f3."Lab Members"
  ADD COLUMN IF NOT EXISTS token VARCHAR(64);

-- Unified upload table for lab member data
CREATE TABLE IF NOT EXISTS pgntarg2udzj1f3."Lab_Member_Uploads" (
  id             SERIAL PRIMARY KEY,
  lab_member_id  INTEGER REFERENCES pgntarg2udzj1f3."Lab Members"(id) ON DELETE SET NULL,
  farm_id        INTEGER REFERENCES pgntarg2udzj1f3."Farms"(id) ON DELETE SET NULL,
  media_type     VARCHAR(20) NOT NULL,
  filename       VARCHAR,
  content        TEXT,
  latitude       DOUBLE PRECISION,
  longitude      DOUBLE PRECISION,
  gps_filename   VARCHAR,
  start_time     TIMESTAMP WITH TIME ZONE,
  end_time       TIMESTAMP WITH TIME ZONE,
  date_collected TIMESTAMP WITH TIME ZONE,
  status         INTEGER NOT NULL DEFAULT 1,
  received_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
