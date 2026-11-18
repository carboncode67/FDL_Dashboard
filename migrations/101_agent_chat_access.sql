-- Agents: who may chat with an interactive agent outside the web dashboard
-- (docs/agent-chat-access.md).
--
-- Agent_Chat_Access: the approved list. One row grants one person — a lab-member
--   User OR a farmer Contact, exactly one — access to one agent kind's chat. The
--   FarmerDataLogger apps show the chat icon only when their token's person has a
--   row here; OFE Dashboard will use the same rows later (it resolves its signed-in
--   farmer by email to a User, else a Contact, the same way /api/data/ofe/app-qr does).
--   The web dashboard's floating chat is NOT gated by this table (it still uses
--   session + canEdit).
--
-- Agent_Requests / Agent_Geometry_Drafts gain contact columns so a farmer's own
--   request and their Apply are attributed (requested_by_id / applied_by_id are
--   FKs to public.users and can't hold a Contact).
--
-- Root-table conventions as 092/097/099: lab_id NOT NULL with the GUC default, FK
-- to labs, ENABLE (not FORCE) RLS tenant_isolation. Additive only, safe to re-run.

CREATE TABLE IF NOT EXISTS "pgntarg2udzj1f3"."Agent_Chat_Access" (
  id              SERIAL PRIMARY KEY,
  lab_id          INT NOT NULL DEFAULT current_setting('app.current_lab_id', true)::int
                  CONSTRAINT fk_agent_chat_access_lab_id REFERENCES public.labs(id),
  agent_kind      TEXT NOT NULL,
  user_id         TEXT REFERENCES public.users(id) ON DELETE CASCADE,
  contact_id      INT REFERENCES "pgntarg2udzj1f3"."Contacts"(id) ON DELETE CASCADE,
  granted_by_id   TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_chat_access_one_person CHECK ((user_id IS NULL) <> (contact_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_chat_access_user
  ON "pgntarg2udzj1f3"."Agent_Chat_Access"(agent_kind, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_chat_access_contact
  ON "pgntarg2udzj1f3"."Agent_Chat_Access"(agent_kind, contact_id) WHERE contact_id IS NOT NULL;

ALTER TABLE "pgntarg2udzj1f3"."Agent_Requests" ADD COLUMN IF NOT EXISTS requested_by_contact_id INT
  REFERENCES "pgntarg2udzj1f3"."Contacts"(id) ON DELETE SET NULL;
ALTER TABLE "pgntarg2udzj1f3"."Agent_Geometry_Drafts" ADD COLUMN IF NOT EXISTS applied_by_contact_id INT
  REFERENCES "pgntarg2udzj1f3"."Contacts"(id) ON DELETE SET NULL;

-- 099 allowed channel web|app; OFE Dashboard is the next channel.
ALTER TABLE "pgntarg2udzj1f3"."Agent_Requests" DROP CONSTRAINT IF EXISTS "Agent_Requests_channel_check";
ALTER TABLE "pgntarg2udzj1f3"."Agent_Requests" ADD CONSTRAINT "Agent_Requests_channel_check"
  CHECK (channel IN ('web', 'app', 'ofe'));

ALTER TABLE "pgntarg2udzj1f3"."Agent_Chat_Access" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'pgntarg2udzj1f3' AND tablename = 'Agent_Chat_Access' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON "pgntarg2udzj1f3"."Agent_Chat_Access"
      USING (lab_id = current_setting('app.current_lab_id', true)::int)
      WITH CHECK (lab_id = current_setting('app.current_lab_id', true)::int);
  END IF;
END $$;
