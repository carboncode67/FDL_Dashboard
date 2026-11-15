import { NextResponse } from "next/server";
import { withAgent } from "@/lib/agent/auth";
import { describeAgentTables } from "@/lib/agent/registry";

// GET /api/agent/tables — schema discovery: every table the Data Sleuth can
// read and its readable columns (lib/agent/registry.ts).
export async function GET(req: Request) {
  return withAgent(req, "read", async () => NextResponse.json({ tables: describeAgentTables() }));
}
