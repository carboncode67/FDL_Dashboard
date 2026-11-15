import { withOwnS3Upload } from "@/lib/s3-upload-route";
import { signParts } from "@/lib/s3-uploads";

// Presigned UploadPart URLs for a batch of parts. Body: { part_numbers: number[] } (≤ 100).
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => null);
  return withOwnS3Upload(params, (u) => signParts(u, body));
}
