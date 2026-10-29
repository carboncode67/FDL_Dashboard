import { withServiceFarm, receiveFarmDocumentUpload } from "@/lib/farm-uploads";

// Bearer twin of POST /api/farms/[id]/documents for OFE_Dashboard's upload box.
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withServiceFarm(req, params, (farmId) => receiveFarmDocumentUpload(req, farmId));
}
