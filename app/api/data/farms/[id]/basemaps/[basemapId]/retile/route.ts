import { withServiceFarm, retileBasemap } from "@/lib/farm-uploads";

// Bearer twin of POST /api/basemaps/[id]/retile; 404s a basemap on another farm.
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string; basemapId: string }> }) {
  const { basemapId } = await params;
  return withServiceFarm(req, params, (farmId) => retileBasemap(parseInt(basemapId), farmId));
}
