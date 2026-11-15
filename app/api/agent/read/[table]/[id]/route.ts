import { NextResponse } from "next/server";
import { withAgent } from "@/lib/agent/auth";
import { AgentQueryError, getAgentRow, getAgentTable } from "@/lib/agent/registry";

const MAX_FEATURES = 5000;

// GET /api/agent/read/:table/:id — one lab-scoped row with every readable
// column. farm_layers pages its GeoJSON: ?features_offset=&features_limit=
// (a cleaned yield layer can hold tens of thousands of points).
export async function GET(req: Request, { params }: { params: Promise<{ table: string; id: string }> }) {
  return withAgent(req, "read", async (agent) => {
    const { table, id } = await params;
    const numId = Number.parseInt(id, 10);
    if (Number.isNaN(numId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    let row: Record<string, unknown> | null;
    try {
      row = await getAgentRow(table, agent.labId, numId, agent.kind);
    } catch (e) {
      if (e instanceof AgentQueryError) return NextResponse.json({ error: e.message }, { status: 400 });
      throw e;
    }
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (table === "farm_layers") {
      const url = new URL(req.url);
      const offset = Math.max(Number(url.searchParams.get("features_offset") ?? 0) || 0, 0);
      const limit = Math.min(Math.max(Number(url.searchParams.get("features_limit") ?? 1000) || 1000, 1), MAX_FEATURES);
      const geojson = row.geojson as { features?: unknown[] } | null;
      const features = Array.isArray(geojson?.features) ? geojson.features : [];
      row = {
        ...row,
        geojson: { ...geojson, features: features.slice(offset, offset + limit) },
        features_total: features.length,
        features_offset: offset,
      };
    }

    return NextResponse.json({ table, agent_authored: !!getAgentTable(table, agent.kind)?.agentAuthored, row });
  });
}
