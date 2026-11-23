import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runWithTenant } from "@/lib/lab-db";
import { prisma } from "@/lib/prisma";
import { listPredictionsForReview } from "@/lib/vision";

// A page of a run's ortho detections for the review panel.
// ?source_id= &class_id= &review=unreviewed|correct|incorrect|all &order=confident|uncertain &offset= &limit=
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  return runWithTenant(async () => {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { runId } = await params;
    const run = await prisma.visionRun.findUnique({ where: { id: Number(runId) || 0 }, select: { id: true } });
    if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const q = new URL(req.url).searchParams;
    const num = (k: string) => { const n = Number(q.get(k)); return Number.isInteger(n) && n > 0 ? n : undefined; };
    const review = q.get("review");
    return NextResponse.json(await listPredictionsForReview(run.id, {
      sourceId: num("source_id"), classId: num("class_id"),
      review: review === "correct" || review === "incorrect" || review === "all" ? review : "unreviewed",
      order: q.get("order") === "uncertain" ? "uncertain" : "confident",
      offset: Number(q.get("offset")) || 0, limit: num("limit"),
    }));
  });
}
