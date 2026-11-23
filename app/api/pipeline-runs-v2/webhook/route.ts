import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/webhook-auth";
import { ingestCatalogRun, type CatalogWebhookPayload } from "@/lib/pipeline-catalog";

// PipelineProcessor's callback for declarative pipeline runs (its executor.py):
// pipeline_run_completed | pipeline_run_failed. Same HMAC-over-body scheme and
// PROCESSING_WEBHOOK_SECRET as the other processor webhooks; exempt from the
// session redirect in proxy.ts.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.PROCESSING_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  const sig = req.headers.get("x-signature-256") ?? "";
  const body = await req.text();
  if (!verifyWebhookSignature(body, sig, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  const action = await ingestCatalogRun(JSON.parse(body) as CatalogWebhookPayload);
  return NextResponse.json({ ok: true, action });
}
