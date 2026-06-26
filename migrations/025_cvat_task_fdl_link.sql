-- Link CVAT annotation tasks back to workflow Tasks
ALTER TABLE "pgntarg2udzj1f3"."Cvat_Tasks"
  ADD COLUMN IF NOT EXISTS fdl_task_id INT REFERENCES "pgntarg2udzj1f3"."Tasks"(id) ON DELETE SET NULL;
