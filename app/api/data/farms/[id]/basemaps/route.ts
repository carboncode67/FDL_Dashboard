import { withServiceFarm, receiveBasemapUpload } from "@/lib/farm-uploads";

// Bearer twin of POST /api/basemaps for OFE_Dashboard's upload box — the farm
// comes from the URL, never the form (OFE streams its browser's multipart body
// through untouched, and that body knows only OFE's own farm id).
export const runtime = "nodejs";
// Same multi-GB reasoning as app/api/basemaps/route.ts.
export const maxDuration = 3600;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withServiceFarm(req, params, (farmId, userId) => receiveBasemapUpload(req, { uploadedById: userId, farmId }));
}
