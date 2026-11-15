import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withServiceFarm } from "@/lib/farm-uploads";
import { serializeContextJob } from "@/lib/context-types";

export const runtime = "nodejs";

// Bearer twin of GET /api/context/jobs/[jobId], nested under the farm: a job
// from another farm is a 404.
export async function GET(req: Request, { params }: { params: Promise<{ id: string; jobId: string }> }) {
  return withServiceFarm(req, params, async (farmId) => {
    const id = parseInt((await params).jobId);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
    const job = await prisma.contextFetchJob.findFirst({
      where: { id, farm_id: farmId },
      include: { Rasters: { orderBy: { id: "asc" } } },
    });
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(serializeContextJob(job), { headers: { "Cache-Control": "no-store" } });
  });
}
