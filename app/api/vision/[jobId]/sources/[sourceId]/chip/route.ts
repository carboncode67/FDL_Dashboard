import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withVisionJob } from "@/lib/vision-route";
import { fetchVisionChip, processingConfigured } from "@/lib/processing";
import { prepareOrthos } from "@/lib/vision";

// Full-resolution chip of one of the job's orthos around lon/lat, for the
// label checker (PipelineProcessor vision_sources.py). Session-authed pass-
// through so the browser never holds PROCESSING_API_KEY.
//   200 image/png, X-Chip-Bounds: west,south,east,north
//   202 {state} while the processor is still downloading the ortho (asked to start if it wasn't)
export const runtime = "nodejs";

type Ctx = { params: Promise<{ jobId: string; sourceId: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { jobId, sourceId } = await params;
  return withVisionJob(jobId, { edit: false }, async ({ jobId }) => {
    if (!processingConfigured) return NextResponse.json({ error: "No processing machine is configured" }, { status: 503 });
    const src = await prisma.visionSource.findFirst({
      where: { id: Number(sourceId) || 0, job_id: jobId, kind: "basemap" },
      include: { Basemap: true },
    });
    if (!src?.Basemap) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const u = new URL(req.url);
    const lon = Number(u.searchParams.get("lon")), lat = Number(u.searchParams.get("lat"));
    const size = Number(u.searchParams.get("size_m") ?? 4);
    if (!(Math.abs(lon) <= 180 && Math.abs(lat) <= 90 && size >= 0.5 && size <= 50)) {
      return NextResponse.json({ error: "Bad chip request" }, { status: 400 });
    }
    let res: Response;
    try {
      res = await fetchVisionChip({ key: `basemap-${src.basemap_id}`, sha256: src.Basemap.sha256, lon, lat, sizeM: size });
    } catch {
      return NextResponse.json({ error: "The processing machine isn't reachable" }, { status: 502 });
    }
    if (res.status === 409) {
      const state = String((await res.json().catch(() => ({}))).detail ?? "missing");
      if (state === "missing" || state.startsWith("failed")) await prepareOrthos([src.basemap_id!]);
      return NextResponse.json({ state: state.startsWith("failed") ? state : "downloading" }, { status: 202 });
    }
    if (!res.ok) return NextResponse.json({ error: `Chip failed (${res.status})` }, { status: 502 });
    return new NextResponse(res.body, {
      headers: {
        "Content-Type": "image/png",
        "X-Chip-Bounds": res.headers.get("x-chip-bounds") ?? "",
        "Cache-Control": "private, max-age=86400",
      },
    });
  });
}
