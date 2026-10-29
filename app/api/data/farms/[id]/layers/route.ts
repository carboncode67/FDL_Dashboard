import { withServiceFarm, receiveFarmLayerUpload } from "@/lib/farm-uploads";

// Bearer twin of POST /api/farms/[id]/layers for OFE_Dashboard's upload box.
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withServiceFarm(req, params, (farmId, userId) => receiveFarmLayerUpload(req, farmId, userId));
}
