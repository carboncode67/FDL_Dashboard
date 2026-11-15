import { NextResponse } from "next/server";
import { withAgent } from "@/lib/agent/auth";
import { AGENT_WRITERS, AgentWriteError, isAgentWriteKind } from "@/lib/agent/writes";

// POST /api/agent/write/{observations|comments|tags|links|recommendations|specs}
// The agent's only write path, and only into the Agent_* tables. Validation
// (run ownership, budget, lab-checked references, plain text) is in
// lib/agent/writes.ts.
export async function POST(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  return withAgent(req, "write", async (agent) => {
    const { kind } = await params;
    if (!isAgentWriteKind(kind)) return NextResponse.json({ error: "Unknown write kind" }, { status: 404 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
    }
    try {
      const result = await AGENT_WRITERS[kind](agent, body as Record<string, unknown>);
      return NextResponse.json(result, { status: "duplicate" in result ? 200 : 201 });
    } catch (e) {
      if (e instanceof AgentWriteError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }
  });
}
