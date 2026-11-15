import { NextResponse } from "next/server";
import { withAgent } from "@/lib/agent/auth";
import { ObservationError, pendingSources } from "@/lib/agent/observations";

// GET /api/agent/observations/pending?table=photos&limit=50[&prompt_sha256=…]
// Ids of the lab's uploads with no current observation (or none from this
// prompt), newest first — what pass 1 ("observe") works through.
export async function GET(req: Request) {
  return withAgent(req, "read", async (agent) => {
    try {
      return NextResponse.json(await pendingSources(agent.labId, new URL(req.url).searchParams));
    } catch (e) {
      if (e instanceof ObservationError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }
  });
}
