import { withOwnS3Upload } from "@/lib/s3-upload-route";
import { listUploadedParts } from "@/lib/s3-uploads";

// Parts storage already has, so an interrupted upload resumes where it stopped.
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withOwnS3Upload(params, listUploadedParts);
}
