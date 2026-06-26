ALTER TABLE "pgntarg2udzj1f3"."Farm_Experiments"
  ADD COLUMN IF NOT EXISTS created_by_id TEXT
  REFERENCES public.users(id) ON DELETE SET NULL;
