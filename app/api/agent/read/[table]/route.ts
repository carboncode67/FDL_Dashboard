import { NextResponse } from "next/server";
import { withAgent } from "@/lib/agent/auth";
import { AgentQueryError, listAgentRows } from "@/lib/agent/registry";

// GET /api/agent/read/:table?<column>=<value>[,<value>…]&since=ISO&limit=&offset=
// Lab-scoped list of any table in lib/agent/registry.ts. Large columns
// (geometry, geojson, transcripts, logs) are only returned by id.
export async function GET(req: Request, { params }: { params: Promise<{ table: string }> }) {
  return withAgent(req, "read", async (agent) => {
    const { table } = await params;
    try {
      return NextResponse.json(await listAgentRows(table, agent.labId, new URL(req.url).searchParams, agent.kind));
    } catch (e) {
      if (e instanceof AgentQueryError) return NextResponse.json({ error: e.message }, { status: 400 });
      throw e;
    }
  });
}
