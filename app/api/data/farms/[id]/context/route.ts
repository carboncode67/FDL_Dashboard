import { NextResponse } from "next/server";
import { withServiceFarm } from "@/lib/farm-uploads";
import { contextJobsForFarm, handleContextPost } from "@/lib/context-request";
import { getContextCoverage } from "@/lib/context-coverage";
import { geodartHasKey } from "@/lib/geodart";

export const runtime = "nodejs";

// Bearer twins of the farm page's Spatial Context card routes, for
// OFE_Dashboard's port of the card (its proxies decide which OFE users may
// pull — farm owners and agronomists). Service-account token only.

// GET → { coverage, jobs, has_key }
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withServiceFarm(req, params, async (farmId) => {
    const [coverage, jobs] = await Promise.all([getContextCoverage(farmId), contextJobsForFarm(farmId)]);
    return NextResponse.json({ coverage, jobs, has_key: geodartHasKey }, { headers: { "Cache-Control": "no-store" } });
  });
}

// POST → pull / update / expand, same body and responses as
// POST /api/farms/[id]/context (lib/context-request.ts).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withServiceFarm(req, params, async (farmId, serviceUserId) => {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    return handleContextPost(farmId, body, serviceUserId);
  });
}
