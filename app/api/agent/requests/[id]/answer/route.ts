import { NextResponse } from "next/server";
import { withAgent } from "@/lib/agent/auth";
import { answerRequest, RequestError } from "@/lib/agent/requests";

// POST /api/agent/requests/:id/answer {status: "done" | "failed", answer}
// The agent's reply to the person. Only the run bound to this request can answer.
// ("write" so the run's map binding is resolved — this is the request it claimed.)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAgent(req, "write", async (agent) => {
    const id = Number((await params).id);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    try {
      return NextResponse.json(await answerRequest(agent, id, body));
    } catch (e) {
      if (e instanceof RequestError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }
  });
}
