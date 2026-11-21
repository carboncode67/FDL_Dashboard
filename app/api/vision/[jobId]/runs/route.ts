import { NextResponse } from "next/server";
import { withVisionJob } from "@/lib/vision-route";
import { startVisionRun } from "@/lib/vision";

// "Run" / "Train and Run": body = run params (head, k, threshold,
// min_patches, gsd_m, max_side, model), all optional.
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return withVisionJob(jobId, { edit: true }, async ({ session, jobId }) => {
    const body = await req.json().catch(() => ({}));
    const run = await startVisionRun(jobId, body, session.user.id ?? null);
    return NextResponse.json(run, { status: run.status === "failed" ? 502 : 201 });
  });
}
