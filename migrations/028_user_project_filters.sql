CREATE TABLE IF NOT EXISTS public."User_Project_Filters" (
  user_id    TEXT    NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, project_id)
);
