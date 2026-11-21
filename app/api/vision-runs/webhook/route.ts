import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/webhook-auth";
import { ingestVisionResults, type VisionWebhookPayload } from "@/lib/vision";

// PipelineProcessor calls this when a vision run finishes (_do_vision_run
// there). Same HMAC-over-body scheme and PROCESSING_WEBHOOK_SECRET as the
// yield/basemap/pipelines webhooks; exempted from the session redirect in
// proxy.ts.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.PROCESSING_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });

  const sig = req.headers.get("x-signature-256") ?? "";
  const body = await req.text();
  if (!verifyWebhookSignature(body, sig, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const action = await ingestVisionResults(JSON.parse(body) as VisionWebhookPayload);
  return NextResponse.json({ ok: true, action });
}
