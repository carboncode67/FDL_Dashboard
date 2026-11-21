import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canEdit, type Role } from "@/lib/roles";
import { runWithTenant } from "@/lib/lab-db";
import { prisma } from "@/lib/prisma";
import { createVisionJob, VisionInputError } from "@/lib/vision";

// Creates the machine-vision job for a workflow Task (one per task):
// body { mode?: "detection" | "segmentation", classes: string[] }.
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const task = await prisma.task.findUnique({ where: { id: parseInt(id) }, select: { id: true, VisionJob: { select: { id: true } } } });
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (task.VisionJob) return NextResponse.json({ error: "This task already has a vision job", job_id: task.VisionJob.id }, { status: 409 });
    const body = (await req.json().catch(() => ({}))) as { mode?: string; classes?: unknown };
    const classes = Array.isArray(body.classes) ? body.classes.filter((c): c is string => typeof c === "string") : [];
    try {
      const job = await createVisionJob(task.id, { mode: body.mode, classes, userId: session.user.id ?? null });
      return NextResponse.json({ id: job.id }, { status: 201 });
    } catch (err) {
      if (err instanceof VisionInputError) return NextResponse.json({ error: err.message }, { status: 400 });
      throw err;
    }
  });
}
