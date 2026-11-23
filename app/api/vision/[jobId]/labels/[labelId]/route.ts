import { NextResponse } from "next/server";
import { withVisionJob } from "@/lib/vision-route";
import { updateLabel } from "@/lib/vision";

// Label checker action on one label: PATCH { geom?: GeoJSON Point (moved),
// class_id?, checked?: boolean, rejected?: boolean }. Returns the label.
export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ jobId: string; labelId: string }> }) {
  const { jobId, labelId } = await params;
  return withVisionJob(jobId, { edit: true }, async ({ jobId }) => {
    const id = Number(labelId);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Bad label id" }, { status: 400 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({ label: await updateLabel(jobId, id, body) });
  });
}
