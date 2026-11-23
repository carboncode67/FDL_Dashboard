import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runWithTenant } from "@/lib/lab-db";
import { prisma } from "@/lib/prisma";
import { canEdit, type Role } from "@/lib/roles";
import { reviewPrediction, VisionInputError } from "@/lib/vision";

// POST { verdict: "correct" | "wrong_class" | "not_object" | "reset", class_id? }
// Records the verdict and turns it into a training label (lib/vision.ts reviewPrediction).
export const runtime = "nodejs";

const VERDICTS = ["correct", "wrong_class", "not_object", "reset"] as const;

export async function POST(req: Request, { params }: { params: Promise<{ predictionId: string }> }) {
  return runWithTenant(async () => {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { predictionId } = await params;
    const pred = await prisma.visionPrediction.findUnique({ where: { id: Number(predictionId) || 0 }, select: { id: true, Run: { select: { job_id: true } } } });
    if (!pred) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = (await req.json().catch(() => ({}))) as { verdict?: string; class_id?: unknown };
    if (!(VERDICTS as readonly string[]).includes(body.verdict ?? "")) return NextResponse.json({ error: "Bad verdict" }, { status: 400 });
    try {
      const p = await reviewPrediction(pred.Run.job_id, pred.id, body.verdict as (typeof VERDICTS)[number],
        body.class_id == null ? null : Number(body.class_id), session.user.id ?? null);
      return NextResponse.json({ id: p.id, review: p.review });
    } catch (err) {
      if (err instanceof VisionInputError) return NextResponse.json({ error: err.message }, { status: 400 });
      throw err;
    }
  });
}
