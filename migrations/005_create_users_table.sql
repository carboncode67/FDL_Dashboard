-- Dashboard login accounts (NextAuth credentials provider)
-- Lives in public schema, separate from experiment data in pgntarg2udzj1f3
CREATE TABLE IF NOT EXISTS public.users (
  id        TEXT PRIMARY KEY,
  name      TEXT,
  email     TEXT NOT NULL,
  password  TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON public.users (email);
