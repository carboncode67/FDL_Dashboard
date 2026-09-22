-- "Forgot password" self-service recovery. The token itself is never stored --
-- only a SHA-256 hash of it, same reasoning as never storing a plaintext
-- password: a DB dump or a stray log line can't be replayed into a live
-- session. expires_at bounds how long a requested link stays valid.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_reset_token_hash TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_password_reset_token_hash_idx
  ON public.users (password_reset_token_hash)
  WHERE password_reset_token_hash IS NOT NULL;
