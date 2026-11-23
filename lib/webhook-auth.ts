import { createHmac, timingSafeEqual } from "crypto";

// Shared HMAC-over-body verification for processing-machine webhooks
// (basemaps, yield runs, vision runs, NAIP packages, declarative pipeline
// runs). All share PROCESSING_WEBHOOK_SECRET since all are called by the same
// processing machine (PipelineProcessor) — no new secret to provision.
//
// Not used by the CVAT webhook (app/api/annotations/webhook) — that one
// verifies against a separate secret (CVAT_WEBHOOK_SECRET) from a different
// caller and predates this helper; left as-is rather than touched in an
// unrelated feature's pass.
export function verifyWebhookSignature(body: string, signatureHeader: string, secret: string): boolean {
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  const sigBuf = Buffer.from(signatureHeader);
  const expectedBuf = Buffer.from(expected);
  return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
}
