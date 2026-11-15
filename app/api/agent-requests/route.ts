import { NextResponse } from "next/server";
import { createRequest, listRequests } from "@/lib/agent/requests";
import { withMapAccess } from "@/lib/agent/request-access";

// POST /api/agent-requests {sampling_map_id, prompt, context?: {point_id?, polygon_id?}}
// Ask the Cartographer to do something on one sampling map. Session + edit rights.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return withMapAccess(Number(body.sampling_map_id), async ({ userId, labId, map }) => {
    const request = await createRequest({
      labId,
      userId,
      kind: "cartographer",
      samplingMapId: map.id,
      prompt: body.prompt,
      context: body.context,
    });
    return NextResponse.json(request, { status: 201 });
  });
}

// GET /api/agent-requests?sampling_map_id=N — this map's requests, newest first, with drafts.
export async function GET(req: Request) {
  const mapId = Number(new URL(req.url).searchParams.get("sampling_map_id"));
  return withMapAccess(mapId, async ({ map }) => NextResponse.json({ requests: await listRequests(map.id) }));
}
