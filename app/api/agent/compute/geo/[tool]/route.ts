import { NextResponse } from "next/server";
import { withAgent } from "@/lib/agent/auth";
import { GeoToolError } from "@/lib/geo-tools";
import { GEO_TOOLS, InputError, type Body } from "@/lib/agent/geo-compute";

// POST /api/agent/compute/geo/:tool — deterministic geometry for map-bound agents
// (docs/cartographer-agent-plan.md §4; tools in lib/agent/geo-compute.ts). Pure: nothing is written.

export async function POST(req: Request, { params }: { params: Promise<{ tool: string }> }) {
  return withAgent(req, "compute", async (agent) => {
    const { tool } = await params;
    const fn = Object.prototype.hasOwnProperty.call(GEO_TOOLS, tool) ? GEO_TOOLS[tool] : null;
    if (!fn) return NextResponse.json({ error: `unknown tool; one of: ${Object.keys(GEO_TOOLS).join(", ")}` }, { status: 404 });
    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
    try {
      return NextResponse.json({ tool, result: await fn(agent, body) });
    } catch (e) {
      if (e instanceof GeoToolError) return NextResponse.json({ error: e.message }, { status: 400 });
      if (e instanceof InputError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }
  });
}
