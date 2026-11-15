import { withOwnS3Upload } from "@/lib/s3-upload-route";
import { abortS3Upload } from "@/lib/s3-uploads";

// Cancel an in-progress multipart upload (the uploader's own only).
export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withOwnS3Upload(params, abortS3Upload);
}
