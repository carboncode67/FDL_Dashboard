import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCvatTaskAnnotations } from "@/lib/cvat";

// CVAT sends a webhook when job/task state changes.
// Configure the webhook in CVAT pointing to: POST /api/annotations/webhook
// Optionally set CVAT_WEBHOOK_SECRET for signature verification.

interface CvatWebhookPayload {
  event: string;
  task?: { id: number; status: string };
  job?: { id: number; state: string; task_id: number };
}

export async function POST(req: Request) {
  const secret = process.env.CVAT_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const sig = req.headers.get("x-signature-256") ?? "";
  const body = await req.text();
  const { createHmac } = await import("crypto");
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  if (sig !== expected) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload: CvatWebhookPayload = JSON.parse(body);
  return handlePayload(payload);
}

async function handlePayload(payload: CvatWebhookPayload) {
  const cvatTaskId =
    payload.task?.id ??
    (payload.job?.task_id ?? null);

  const isComplete =
    payload.task?.status === "completed" ||
    payload.job?.state === "completed";

  if (!cvatTaskId || !isComplete) {
    return NextResponse.json({ ok: true, action: "ignored" });
  }

  const task = await prisma.cvatTask.findFirst({ where: { cvat_task_id: cvatTaskId } });
  if (!task) return NextResponse.json({ ok: true, action: "task_not_found" });

  try {
    const annotations = await getCvatTaskAnnotations(cvatTaskId);
    await ingestCocoAnnotations(task.id, annotations);
    await prisma.cvatTask.update({ where: { id: task.id }, data: { status: "completed" } });
  } catch (err) {
    console.error("[cvat webhook] annotation ingest failed", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }

  return NextResponse.json({ ok: true, action: "ingested" });
}

// Parses a COCO-format annotation export from CVAT and upserts Annotation rows.
async function ingestCocoAnnotations(fdlTaskId: number, coco: {
  images?: { id: number; file_name: string }[];
  annotations?: { image_id: number; category_id: number; segmentation: number[][]; bbox: number[]; score?: number }[];
  categories?: { id: number; name: string }[];
}) {
  if (!coco.images || !coco.annotations || !coco.categories) return;

  const categoryMap = new Map(coco.categories.map((c) => [c.id, c.name]));
  const imageMap = new Map(coco.images.map((img) => [img.id, img.file_name]));

  // Group annotations by image
  const byImage = new Map<number, typeof coco.annotations>();
  for (const ann of coco.annotations) {
    const list = byImage.get(ann.image_id) ?? [];
    list.push(ann);
    byImage.set(ann.image_id, list);
  }

  for (const [imageId, anns] of byImage) {
    const filename = imageMap.get(imageId);
    if (!filename) continue;

    // Find the matching upload by filename (check photos first, then lab uploads)
    const photo = await prisma.photo.findFirst({ where: { filename }, select: { id: true } });
    const labUpload = photo
      ? null
      : await prisma.labMemberUpload.findFirst({ where: { filename }, select: { id: true } });

    const uploadId = photo?.id ?? labUpload?.id;
    const uploadTable = photo ? "photos" : labUpload ? "lab-member-uploads" : null;
    if (!uploadId || !uploadTable) continue;

    const shapes = anns.map((a) => ({
      label: categoryMap.get(a.category_id) ?? "unknown",
      type: a.segmentation.length > 0 ? "polygon" : "bbox",
      points: a.segmentation[0] ?? a.bbox,
      confidence: a.score ?? null,
    }));
    const labelSet = [...new Set(shapes.map((s) => s.label))];

    const existing = await prisma.annotation.findFirst({
      where: { upload_id: uploadId, upload_table: uploadTable, cvat_task_id: fdlTaskId },
    });
    if (existing) {
      await prisma.annotation.update({ where: { id: existing.id }, data: { shapes, label_set: labelSet } });
    } else {
      await prisma.annotation.create({
        data: { upload_id: uploadId, upload_table: uploadTable, filename, cvat_task_id: fdlTaskId, shapes, label_set: labelSet, source: "cvat" },
      });
    }
  }
}
