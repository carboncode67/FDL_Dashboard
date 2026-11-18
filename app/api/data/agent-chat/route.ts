import { NextResponse } from "next/server";
import { chatAgentInfo, chatMapIds, withBearerChat } from "@/lib/agent/chat-access";

// GET /api/data/agent-chat — does this app token's person get the agent chat?
// The apps call this on launch / refresh and show the chat icon only when
// `enabled` (docs/agent-chat-access.md). Never 403s for "not approved", so an
// unapproved device just learns enabled: false.
//   { enabled, agents: [{kind, label, blurb, needs_map}], sampling_map_ids: [...] }
// sampling_map_ids = the person's maps the agent can work on (sent to them, not
// OFE-owned). The icon goes on those maps only.
export async function GET(req: Request) {
  return withBearerChat(
    req,
    async ({ person, labId, kinds }) => {
      if (!kinds.length) return NextResponse.json({ enabled: false, agents: [], sampling_map_ids: [] });
      return NextResponse.json({
        enabled: true,
        agents: kinds.map(chatAgentInfo),
        sampling_map_ids: await chatMapIds(labId, person),
      });
    },
    { requireGrant: false },
  );
}
