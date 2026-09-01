import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdmin, type Role } from "@/lib/roles";
import { processingConfigured, triggerPipelineRun } from "@/lib/processing";

// Re-run a past pipeline run. Optionally carries a `prompt` — an operator
// instruction the processor folds into its LLM wiring step for this run only
// ("set output raster resolution to 5 m instead of the default").
//
// Input resolution, in priority order:
//   drone-flight run   -> same drone_flight_record_id (landing folder)
//   test-data-rows run -> that Data Table's *current* rows
//   other upload run   -> the same upload file
//   test run           -> the pipeline's own sample dataset
export async function POST(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role as Role)) {
    return NextResponse.json({ error: "Only admins can run pipelines" }, { status: 403 });
  }

  const { runId } = await params;
  const priorRun = await prisma.pipelineRun.findUnique({
    where: { id: parseInt(runId) },
    include: { Pipeline: true },
  });
  if (!priorRun) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const pipeline = priorRun.Pipeline;
  if (!pipeline.external_pipeline_id) {
    return NextResponse.json({ error: "Pipeline is not registered with the processing machine yet" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const prompt: string | null = typeof body.prompt === "string" && body.prompt.trim()
    ? body.prompt.trim()
    : null;

  const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
  let inputFileUrl: string | undefined;
  let droneFlightRecordId: number | undefined;

  if (priorRun.target_drone_flight_id) {
    droneFlightRecordId = priorRun.target_drone_flight_id;
  } else if (priorRun.trigger_data_table_id && priorRun.trigger_upload_id) {
    inputFileUrl = `${baseUrl}/api/data/experiment-tests/${priorRun.trigger_upload_id}/tables/${priorRun.trigger_data_table_id}/rows`;
  } else if (priorRun.trigger_upload_id && priorRun.trigger_upload_table) {
    inputFileUrl = `${baseUrl}/api/data/files/${priorRun.trigger_upload_table}/${priorRun.trigger_upload_id}`;
  } else {
    inputFileUrl = `${baseUrl}/api/files/pipeline-datasets/${pipeline.sample_dataset_filename}`;
  }

  const run = await prisma.pipelineRun.create({
    data: {
      pipeline_id: pipeline.id,
      is_test_run: priorRun.is_test_run,
      trigger_upload_id: priorRun.trigger_upload_id,
      trigger_upload_table: priorRun.trigger_upload_table,
      trigger_data_table_id: priorRun.trigger_data_table_id,
      target_drone_flight_id: priorRun.target_drone_flight_id,
      // Same trigger context as priorRun (same upload/experiment/flight, just run
      // again) — reuse its already-resolved farm rather than re-resolving.
      farm_id: priorRun.farm_id,
      prompt,
      status: "queued",
    },
  });

  if (!processingConfigured) {
    return NextResponse.json({ ...run, processing_configured: false }, { status: 201 });
  }

  try {
    const { external_job_id } = await triggerPipelineRun(pipeline.external_pipeline_id, {
      run_id: run.id,
      callback_url: `${baseUrl}/api/pipelines/webhook`,
      ...(droneFlightRecordId ? { drone_flight_record_id: droneFlightRecordId } : { input_file_url: inputFileUrl }),
      ...(prompt ? { prompt } : {}),
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
