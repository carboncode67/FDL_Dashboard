import { withServiceFarm } from "@/lib/farm-uploads";
import { deleteFailedBasemap } from "@/lib/failed-uploads";

// Bearer twin of DELETE /api/basemaps/[id] (failed/queued only); 404s a
// basemap on another farm.
export const runtime = "nodejs";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; basemapId: string }> }) {
  const { basemapId } = await params;
  return withServiceFarm(req, params, (farmId) => deleteFailedBasemap(parseInt(basemapId), farmId));
}
