import { withServiceFarm, receiveYieldCardUpload } from "@/lib/farm-uploads";

// Bearer twin of POST /api/farms/[id]/yield for OFE_Dashboard's upload box.
export const runtime = "nodejs";
export const maxDuration = 3600;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withServiceFarm(req, params, (farmId, userId) => receiveYieldCardUpload(req, farmId, userId));
}
