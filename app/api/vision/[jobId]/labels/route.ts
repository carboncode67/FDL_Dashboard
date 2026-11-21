import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withVisionJob } from "@/lib/vision-route";
import { addLabels } from "@/lib/vision";

// POST { labels: [{ source_id, class_id, geom: GeoJSON Point|Polygon }] } —
// pixels for a photo source, lon/lat for a basemap source.
// DELETE ?ids=1,2 or ?source_id=&origin= (e.g. clear a GPS import to redo it).
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return withVisionJob(jobId, { edit: true }, async ({ session, jobId }) => {
    const body = (await req.json().catch(() => ({}))) as { labels?: unknown };
    const labels = Array.isArray(body.labels) ? body.labels : [];
    const added = await addLabels(jobId, labels as Parameters<typeof addLabels>[1], session.user.id ?? null);
    return NextResponse.json({ added }, { status: 201 });
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return withVisionJob(jobId, { edit: true }, async ({ jobId }) => {
    const url = new URL(req.url);
    const ids = (url.searchParams.get("ids") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
    const sourceId = Number(url.searchParams.get("source_id"));
    const origin = url.searchParams.get("origin");
    if (!ids.length && !Number.isInteger(sourceId)) {
      return NextResponse.json({ error: "Pass ids or source_id" }, { status: 400 });
    }
    const res = await prisma.visionLabel.deleteMany({
      where: {
        job_id: jobId,
        ...(ids.length ? { id: { in: ids } } : { source_id: sourceId }),
        ...(origin ? { origin } : {}),
      },
    });
    return NextResponse.json({ deleted: res.count });
  });
}
