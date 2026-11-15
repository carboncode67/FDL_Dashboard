import { withServiceFarm } from "@/lib/farm-uploads";
import { handleCoverageGet } from "@/lib/context-request";

export const runtime = "nodejs";

// Bearer twin of GET /api/farms/[id]/context/coverage (coverage + dry run).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withServiceFarm(req, params, (farmId) => handleCoverageGet(farmId, new URL(req.url)));
}
