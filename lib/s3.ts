import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// S3-compatible object storage (Garage on the lab server) for direct-to-storage
// uploads — docs/garage-s3-upload-plan.md. Feature-flagged like
// processingConfigured: with the S3_* env vars unset, the unified farm upload
// box keeps using the busboy POST /api/basemaps path.
//
// A SigV4 presigned URL signs the Host it's for, so there's one client per
// endpoint:
//   internal  — the app's own API calls (create/list/complete/abort/head)
//   public    — part-upload and user-download URLs, signed for the browser's host
//   processor — the tiling job's download URL, signed for the host Datamachine
//               reaches Garage on (the campus LAN, not the Pangolin tunnel)

const ENDPOINT_INTERNAL = process.env.S3_ENDPOINT_INTERNAL;
const ENDPOINT_PUBLIC = process.env.S3_ENDPOINT_PUBLIC;
const ENDPOINT_PROCESSOR = process.env.S3_ENDPOINT_PROCESSOR || ENDPOINT_INTERNAL;
const REGION = process.env.S3_REGION || "garage";
const ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;

export const S3_BUCKET = process.env.S3_BUCKET ?? "";

export const s3Configured = !!(ENDPOINT_INTERNAL && ENDPOINT_PUBLIC && S3_BUCKET && ACCESS_KEY_ID && SECRET_ACCESS_KEY);

function makeClient(endpoint: string): S3Client {
  return new S3Client({
    endpoint,
    region: REGION,
    forcePathStyle: true, // Garage's vhost-style needs per-bucket DNS; path-style needs nothing
    credentials: { accessKeyId: ACCESS_KEY_ID!, secretAccessKey: SECRET_ACCESS_KEY! },
    // SDK v3.729+ adds CRC32 checksums to every request by default, including
    // presigned UploadPart URLs (x-amz-checksum-* / x-amz-sdk-checksum-algorithm
    // in the query string), which a plain browser PUT can't satisfy. Only send
    // one when an operation strictly requires it.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

const clients = new Map<string, S3Client>();
function clientFor(endpoint: string | undefined): S3Client {
  if (!s3Configured || !endpoint) throw new Error("S3 storage is not configured (S3_* env vars)");
  let c = clients.get(endpoint);
  if (!c) {
    c = makeClient(endpoint);
    clients.set(endpoint, c);
  }
  return c;
}

export const s3Internal = () => clientFor(ENDPOINT_INTERNAL);
export const s3Public = () => clientFor(ENDPOINT_PUBLIC);
export const s3Processor = () => clientFor(ENDPOINT_PROCESSOR);

/** Presigned GET for PipelineProcessor. 24 h so a queued job can still fetch it. */
export function presignProcessorDownload(key: string, expiresIn = 24 * 3600): Promise<string> {
  return getSignedUrl(s3Processor(), new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }), { expiresIn });
}

/** Short-lived presigned GET for a signed-in user's browser (the files route redirect). */
export function presignUserDownload(key: string, filename: string, expiresIn = 300): Promise<string> {
  const safeName = filename.replace(/["\\\r\n]/g, "_");
  return getSignedUrl(
    s3Public(),
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ResponseContentDisposition: `inline; filename="${safeName}"`,
    }),
    { expiresIn },
  );
}
