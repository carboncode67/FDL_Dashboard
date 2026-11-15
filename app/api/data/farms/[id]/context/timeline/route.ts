import { NextResponse } from "next/server";
import { withServiceFarm } from "@/lib/farm-uploads";
import { buildContextTimeline } from "@/lib/context-timeline";

export const runtime = "nodejs";

// The farm's spatial-context lanes only (drought weeks + imagery dates;
// lib/context-timeline.ts). OFE merges in its own events (management,
// observations, its mirrored uploads), so FDB's events aren't sent. `null`
// when the farm has no dated context yet.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withServiceFarm(req, params, async (farmId) =>
    NextResponse.json(await buildContextTimeline(farmId), { headers: { "Cache-Control": "no-store" } }),
  );
}
