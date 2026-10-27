import { NextResponse } from "next/server";
import { createHash } from "crypto";
import fs from "fs";
import { Readable, Transform } from "stream";
import { pipeline as streamPipeline } from "stream/promises";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature } from "@/lib/webhook-auth";
import { parseNaipBbox } from "@/lib/naip-bbox";
import { NAIP_PACKAGE_DIR, naipPackagePath } from "@/lib/naip-package";

// PipelineProcessor calls this when a NAIP MBTiles build finishes (naip_package.py
// via main.py's _do_naip_package). Same HMAC-over-body scheme and shared
// PROCESSING_WEBHOOK_SECRET as the basemaps/pipelines webhooks; exempted from
// session auth in proxy.ts. Like those webhooks it has no user session, so it uses
// the base Prisma client (no lab context).
export const runtime = "nodejs";

type Payload =
  | {
      event: "naip_package_completed";
      package_id: number;
      bbox: number[];
      package_url: string;
      tiles: number;
      skipped: number;
      bytes: number;
      sha256: string;
      min_zoom: number;
      max_zoom: number;
    }
  | { event: "naip_package_failed"; package_id: number; error_message?: string };

// Streams the finished package from the processor to `dest`, hashing as it goes so
// a truncated or corrupted transfer can't be installed as the live file.
async function downloadPackage(url: string, dest: string): Promise<{ bytes: number; sha256: string }> {
  const apiKey = process.env.PROCESSING_API_KEY;
  const res = await fetch(url, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} });
  if (!res.ok || !res.body) throw new Error(`package download failed: ${res.status}`);
  const hash = createHash("sha256");
  let bytes = 0;
  const tap = new Transform({
    transform(chunk, _enc, cb) {
      hash.update(chunk);
      bytes += chunk.length;
      cb(null, chunk);
    },
  });
  await streamPipeline(Readable.fromWeb(res.body as import("stream/web").ReadableStream), tap, fs.createWriteStream(dest));
  return { bytes, sha256: hash.digest("hex") };
}

export async function POST(req: Request) {
  const secret = process.env.PROCESSING_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });

  const sig = req.headers.get("x-signature-256") ?? "";
  const body = await req.text();
  if (!verifyWebhookSignature(body, sig, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload: Payload = JSON.parse(body);
  const map = await prisma.samplingMap.findUnique({ where: { id: payload.package_id } });
  // Deleted map, or the package was removed while building: nothing to update.
  if (!map || map.naip_package_status !== "pending") {
    return NextResponse.json({ ok: true, action: "ignored" });
  }

  if (payload.event === "naip_package_failed") {
    await prisma.samplingMap.update({
      where: { id: map.id },
      data: { naip_package_status: "failed", naip_package_error: (payload.error_message ?? "Build failed").slice(0, 500) },
    });
    return NextResponse.json({ ok: true, action: "failed" });
  }

  const bbox = parseNaipBbox(payload.bbox);
  const finalPath = naipPackagePath(map.id);
  const tmpPath = `${finalPath}.${Date.now()}.tmp`;
  try {
    if (!bbox) throw new Error("processor reported an invalid bbox");
    fs.mkdirSync(NAIP_PACKAGE_DIR, { recursive: true });
    const got = await downloadPackage(payload.package_url, tmpPath);
    if (got.sha256 !== payload.sha256 || got.bytes !== payload.bytes) {
      throw new Error("package checksum mismatch");
    }
    // Atomic replace: a phone mid-download of the previous package keeps its open file.
    fs.renameSync(tmpPath, finalPath);
    await prisma.samplingMap.update({
      where: { id: map.id },
      data: {
        naip_package_status: "ready",
        naip_package_error: null,
        naip_package_built_at: new Date(),
        naip_package_bbox: bbox,
        naip_package_min_zoom: payload.min_zoom,
        naip_package_max_zoom: payload.max_zoom,
        naip_package_tiles: payload.tiles,
        naip_package_bytes: got.bytes,
        naip_package_sha256: got.sha256,
      },
    });
    return NextResponse.json({ ok: true, action: "ready" });
  } catch (err) {
    console.error("[naip package webhook] ingestion failed", err);
    fs.unlink(tmpPath, () => {});
    await prisma.samplingMap.update({
      where: { id: map.id },
      data: { naip_package_status: "failed", naip_package_error: "Failed to retrieve the finished package" },
    });
    return NextResponse.json({ ok: true, action: "ingestion_failed" });
  }
}
