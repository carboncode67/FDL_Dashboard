import { withServiceFarm } from "@/lib/farm-uploads";
import { retryYieldRun } from "@/lib/yield-runs";

// Bearer twin of POST /api/yield-runs/[id]/retry; 404s a run on another farm.
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const { runId } = await params;
  return withServiceFarm(req, params, (farmId) => retryYieldRun(parseInt(runId), farmId));
}
