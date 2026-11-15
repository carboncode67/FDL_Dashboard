import { withServiceFarm } from "@/lib/farm-uploads";
import { deleteFailedYieldRun } from "@/lib/failed-uploads";

// Bearer twin of DELETE /api/yield-runs/[id]; 404s a run on another farm.
// A finished run only with ?ready=1, which OFE sends only for a user with
// its delete rights (still 409 while processing).
export const runtime = "nodejs";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const { runId } = await params;
  return withServiceFarm(req, params, (farmId) => deleteFailedYieldRun(parseInt(runId), farmId, new URL(req.url).searchParams.get("ready") === "1"));
}
