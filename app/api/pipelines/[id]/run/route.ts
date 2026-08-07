import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdmin, type Role } from "@/lib/roles";
import { processingConfigured, triggerPipelineRun } from "@/lib/processing";

// Manual "run again" trigger — re-tests the pipeline's own sample dataset.
// Real triggers (new matching uploads) go through lib/pipeline-match.ts instead.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role as Role)) {
    return NextResponse.json({ error: "Only admins can run pipelines" }, { status: 403 });
  }

  const { id } = await params;
  const pipeline = await prisma.pipeline.findUnique({ where: { id: parseInt(id) } });
  if (!pipeline) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!pipeline.external_pipeline_id) {
    return NextResponse.json({ error: "Pipeline has not been registered with the processing machine yet" }, { status: 400 });
  }

  const run = await prisma.pipelineRun.create({
    data: { pipeline_id: pipeline.id, is_test_run: true, status: "queued" },
  });

  if (!processingConfigured) {
    return NextResponse.json({ ...run, processing_configured: false }, { status: 201 });
  }

  try {
    const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
    const { external_job_id } = await triggerPipelineRun(pipeline.external_pipeline_id, {
      run_id: run.id,
      input_file_url: `${baseUrl}/api/files/pipeline-datasets/${pipeline.sample_dataset_filename}`,
      callback_url: `${baseUrl}/api/pipelines/webhook`,
    });

    const updated = await prisma.pipelineRun.update({
      where: { id: run.id },
      data: { status: "running", external_job_id, started_at: new Date() },
    });
    return NextResponse.json({ ...updated, processing_configured: true }, { status: 201 });
  } catch (err) {
    const updated = await prisma.pipelineRun.update({
      where: { id: run.id },
      data: { status: "failed", error_message: err instanceof Error ? err.message : String(err) },
    });
    return NextResponse.json({ ...updated, processing_configured: true }, { status: 201 });
  }
}
