import { withServiceFarm } from "@/lib/farm-uploads";
import { deleteFailedYieldRun } from "@/lib/failed-uploads";

// Bearer twin of DELETE /api/yield-runs/[id]; 404s a run on another farm.
export const runtime = "nodejs";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const { runId } = await params;
  return withServiceFarm(req, params, (farmId) => deleteFailedYieldRun(parseInt(runId), farmId));
}
