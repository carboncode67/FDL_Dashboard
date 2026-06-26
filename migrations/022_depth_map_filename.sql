-- Add depth_filename to Photos and Lab_Member_Uploads for paired LiDAR depth maps
ALTER TABLE "pgntarg2udzj1f3"."Photos"
  ADD COLUMN IF NOT EXISTS depth_filename TEXT;

ALTER TABLE "pgntarg2udzj1f3"."Lab_Member_Uploads"
  ADD COLUMN IF NOT EXISTS depth_filename TEXT;
