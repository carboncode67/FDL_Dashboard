import { NextResponse } from "next/server";
import { withAgent } from "@/lib/agent/auth";
import { claimRequest, RequestError } from "@/lib/agent/requests";

const MAX_WAIT_MS = 20_000;
const POLL_MS = 1_000;

// POST /api/agent/requests/claim {run_id, wait_s?}
// Long-poll for the next queued request of this agent's kind. On success the run
// is bound to that request's sampling map (and its farm) for every later read,
// compute call and draft. {request: null} if nothing arrived within wait_s.
export async function POST(req: Request) {
  return withAgent(req, "requests", async (agent) => {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const runId = body.run_id;
    if (typeof runId !== "number" || !Number.isInteger(runId)) {
      return NextResponse.json({ error: "run_id is required" }, { status: 400 });
    }
    const waitMs = Math.min(Math.max(Number(body.wait_s ?? 20) * 1000 || 0, 0), MAX_WAIT_MS);
    const deadline = Date.now() + waitMs;
    try {
      for (;;) {
        const claimed = await claimRequest(agent, runId);
        if (claimed || Date.now() >= deadline || req.signal.aborted) return NextResponse.json({ request: claimed });
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    } catch (e) {
      if (e instanceof RequestError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }
  });
}
