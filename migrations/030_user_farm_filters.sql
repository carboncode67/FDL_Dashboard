CREATE TABLE IF NOT EXISTS public."User_Farm_Filters" (
  user_id TEXT    NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  farm_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, farm_id)
);

CREATE TABLE IF NOT EXISTS public."User_Filter_Settings" (
  user_id         TEXT    PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  show_unassigned BOOLEAN NOT NULL DEFAULT TRUE
);
