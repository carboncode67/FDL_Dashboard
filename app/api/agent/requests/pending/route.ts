import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAgent } from "@/lib/agent/auth";
import { expireStale } from "@/lib/agent/requests";

const MAX_WAIT_MS = 25_000;
const POLL_MS = 1_000;

// GET /api/agent/requests/pending?wait_s=20
// Long-poll: is anything queued for this agent's kind in its lab? Claims nothing
// and needs no run — a worker waits here and only opens a run (and claims) when
// there is work, so idle workers don't burn through the daily run cap.
export async function GET(req: Request) {
  return withAgent(req, "requests", async (agent) => {
    const waitMs = Math.min(Math.max(Number(new URL(req.url).searchParams.get("wait_s") ?? 20) * 1000 || 0, 0), MAX_WAIT_MS);
    const deadline = Date.now() + waitMs;
    await expireStale(agent.kind);
    for (;;) {
      const queued = await prisma.agentRequest.count({ where: { lab_id: agent.labId, agent_kind: agent.kind, status: "queued" } });
      if (queued || Date.now() >= deadline || req.signal.aborted) return NextResponse.json({ queued });
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  });
}
