import { NextResponse } from "next/server";
import { withAgent } from "@/lib/agent/auth";
import { searchAgentRows } from "@/lib/agent/registry";

// GET /api/agent/search?q=dump+wagon[&tables=notes,farm_experiments]
// Case-insensitive substring search over each registry table's text columns,
// lab-scoped. Separate from lib/search.ts, which includes Contacts and relies
// on RLS for lab scoping.
export async function GET(req: Request) {
  return withAgent(req, "read", async (agent) => {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    if (q.trim().length < 2) return NextResponse.json({ query: q, hits: [] });
    const tables = url.searchParams.get("tables")?.split(",").map((s) => s.trim()).filter(Boolean);
    return NextResponse.json({ query: q.trim(), hits: await searchAgentRows(q, agent.labId, tables) });
  });
}
