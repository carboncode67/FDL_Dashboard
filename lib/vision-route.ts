import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { canEdit, type Role } from "@/lib/roles";
import { runWithTenant } from "@/lib/lab-db";
import { prisma } from "@/lib/prisma";
import { VisionInputError } from "@/lib/vision";

// Shared wrapper for the session-auth /api/vision/[jobId]/* routes: tenant
// context, sign-in, optional canEdit, and the job looked up through RLS (a
// job of another lab is a plain 404). VisionInputError -> 400 with its text.
export async function withVisionJob(
  jobIdParam: string,
  opts: { edit: boolean },
  fn: (ctx: { session: Session; jobId: number; taskId: number }) => Promise<Response>,
): Promise<Response> {
  return runWithTenant(async () => {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (opts.edit && !canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const jobId = parseInt(jobIdParam);
    const job = Number.isInteger(jobId) ? await prisma.visionJob.findUnique({ where: { id: jobId }, select: { id: true, task_id: true } }) : null;
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
    try {
      return await fn({ session, jobId: job.id, taskId: job.task_id });
    } catch (err) {
      if (err instanceof VisionInputError) return NextResponse.json({ error: err.message }, { status: 400 });
      throw err;
    }
  });
}
