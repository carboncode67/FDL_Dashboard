import { withOwnS3Upload } from "@/lib/s3-upload-route";
import { completeBasemapS3Upload } from "@/lib/s3-uploads";

// Assemble the parts, create the Basemaps row and start tiling.
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withOwnS3Upload(params, completeBasemapS3Upload);
}
