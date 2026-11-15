import { withServiceFarm } from "@/lib/farm-uploads";
import { deleteFailedBasemap } from "@/lib/failed-uploads";

// Bearer twin of DELETE /api/basemaps/[id]; 404s a basemap on another farm.
// A finished basemap only with ?ready=1, which OFE sends only for a user with
// its delete rights (still 409 while tiling).
export const runtime = "nodejs";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; basemapId: string }> }) {
  const { basemapId } = await params;
  return withServiceFarm(req, params, (farmId) => deleteFailedBasemap(parseInt(basemapId), farmId, new URL(req.url).searchParams.get("ready") === "1"));
}
