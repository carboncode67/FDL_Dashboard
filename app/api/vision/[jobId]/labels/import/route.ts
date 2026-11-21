import { NextResponse } from "next/server";
import { withVisionJob } from "@/lib/vision-route";
import { importPointLabels } from "@/lib/vision";

// Field GPS points as labels on one basemap source. multipart: file
// (GeoJSON / CSV with lat/lon, EPSG:4326), source_id, and class_column
// and/or default_class_id.
export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return withVisionJob(jobId, { edit: true }, async ({ session, jobId }) => {
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) {
      return NextResponse.json({ error: "File too large (10 MB max)" }, { status: 413 });
    }
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large (10 MB max)" }, { status: 413 });
    const defaultClass = Number(form.get("default_class_id"));
    const result = await importPointLabels(jobId, {
      sourceId: Number(form.get("source_id")),
      text: await file.text(),
      filename: file.name,
      classColumn: (form.get("class_column") as string | null)?.trim() || null,
      defaultClassId: Number.isInteger(defaultClass) && defaultClass > 0 ? defaultClass : null,
      userId: session.user.id ?? null,
    });
    return NextResponse.json(result, { status: 201 });
  });
}
