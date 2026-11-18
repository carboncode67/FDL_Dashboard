import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRequest, expireStale, RequestError } from "@/lib/agent/requests";
import { chatMap, isChatKind, ownRequestWhere, requesterOf, toChatRequest, withBearerChat } from "@/lib/agent/chat-access";

// GET /api/data/agent-chat/requests?sampling_map_id=N — the caller's OWN requests
// on that map, newest first, with drafts. Unlike the web chat (lab staff see every
// request on a map), a phone user only sees their own: a farmer shouldn't read
// lab staff's prompts on a map shared with them.
export async function GET(req: Request) {
  return withBearerChat(req, async ({ person, labId }) => {
    const map = await chatMap(labId, person, Number(new URL(req.url).searchParams.get("sampling_map_id")));
    await expireStale();
    const rows = await prisma.agentRequest.findMany({
      where: { sampling_map_id: map.id, lab_id: labId, ...ownRequestWhere(person) },
      orderBy: { created_at: "desc" },
      take: 30,
      include: { Drafts: { orderBy: { id: "asc" } } },
    });
    return NextResponse.json({ requests: rows.map(toChatRequest) });
  });
}

// POST /api/data/agent-chat/requests {sampling_map_id, prompt, agent_kind?, context?: {point_id?, polygon_id?}}
export async function POST(req: Request) {
  return withBearerChat(req, async ({ person, labId, kinds }) => {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const kind = body.agent_kind ?? "cartographer";
    if (!isChatKind(kind) || !kinds.includes(kind)) throw new RequestError("The agent chat isn't enabled for you", 403);
    const map = await chatMap(labId, person, body.sampling_map_id);
    const { userId, contactId } = requesterOf(person);
    const created = await createRequest({
      labId,
      userId,
      contactId,
      kind,
      samplingMapId: map.id,
      prompt: body.prompt,
      context: body.context,
      channel: "app",
    });
    return NextResponse.json(toChatRequest({ ...created, Drafts: [] }), { status: 201 });
  });
}
