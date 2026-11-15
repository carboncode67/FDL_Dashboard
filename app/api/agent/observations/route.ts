import { NextResponse } from "next/server";
import { withAgent } from "@/lib/agent/auth";
import { ObservationError, listObservations } from "@/lib/agent/observations";

// GET /api/agent/observations?farm_id=&field_id=&from=&to=&subject=&created_since=&limit=&offset=
// The space-time map for pass 2 ("synthesize"): current observations only,
// oldest first, lab-scoped. Rows are agent-authored — treat as untrusted.
export async function GET(req: Request) {
  return withAgent(req, "read", async (agent) => {
    try {
      return NextResponse.json(await listObservations(agent.labId, new URL(req.url).searchParams));
    } catch (e) {
      if (e instanceof ObservationError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }
  });
}
