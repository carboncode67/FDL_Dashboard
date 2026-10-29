import { withServiceFarm, receiveBoundaryUpload } from "@/lib/farm-uploads";

// Bearer twin of POST /api/farms/[id]/boundaries for OFE_Dashboard's upload
// box. OFE pulls the new Fields straight back (pullNewFieldsForFarm) so they
// show up there without waiting for its 5-minute sync.
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withServiceFarm(req, params, (farmId) => receiveBoundaryUpload(req, farmId));
}
