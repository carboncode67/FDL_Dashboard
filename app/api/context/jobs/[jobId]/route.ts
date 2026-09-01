import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { serializeContextJob } from "@/lib/context-types";

export const runtime = "nodejs";

// Polled by the farm-page "Spatial Context" card every few seconds while a job is
// in flight. The actual poll → download → ingest happens on the node-cron sweep
// (lib/scheduler.ts → lib/context-fetch.ts), so this is a plain read.
export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { jobId } = await params;
  const id = parseInt(jobId);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

  const job = await prisma.contextFetchJob.findUnique({
    where: { id },
    include: { Rasters: { orderBy: { id: "asc" } } },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(serializeContextJob(job), { headers: { "Cache-Control": "no-store" } });
}
