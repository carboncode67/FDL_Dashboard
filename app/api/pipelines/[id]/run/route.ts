import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdmin, type Role } from "@/lib/roles";
import { processingConfigured, triggerPipelineRun } from "@/lib/processing";
import { resolveFarmForDroneFlight, farmCentroidFor } from "@/lib/pipeline-farm";

// Manual run trigger. For a normal (upload-matched) pipeline this re-tests the
// pipeline's own sample dataset. For a target_kind = "drone_flight" pipeline, the
// caller must supply drone_flight_record_id — imagery for these never flows through
// the Dashboard, it's copied directly onto the processing machine's landing folder
// (see Item90_Processing_Pipeline_Scope.md), so there's no file URL to send, only
// which flight record's landing folder to process.
// Real triggers for normal pipelines (new matching uploads) go through
// lib/pipeline-match.ts instead — this route is manual-only.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  let droneFlightRecordId: number | null = null;
  if (pipeline.target_kind === "drone_flight") {
    const body = await req.json().catch(() => ({}));
    droneFlightRecordId = Number(body.drone_flight_record_id) || null;
    if (!droneFlightRecordId) {
      return NextResponse.json({ error: "drone_flight_record_id is required for this pipeline" }, { status: 400 });
    }
    const flight = await prisma.droneFlightRecord.findUnique({ where: { id: droneFlightRecordId } });
    if (!flight) return NextResponse.json({ error: "Drone flight record not found" }, { status: 404 });
  }

  // A "Run manually" on a normal pipeline replays the pipeline's own sample dataset —
  // no real upload/experiment context, so no farm to resolve there. A drone-flight
  // pipeline's flight record does resolve to one.
  const farm_id = droneFlightRecordId !== null
    ? await resolveFarmForDroneFlight(droneFlightRecordId)
    : null;
  const farmCentroid = farm_id ? await farmCentroidFor(farm_id) : null;

  const run = await prisma.pipelineRun.create({
    data: {
      pipeline_id: pipeline.id,
      is_test_run: droneFlightRecordId === null,
      target_drone_flight_id: droneFlightRecordId,
      farm_id,
      status: "queued",
    },
  });

  if (!processingConfigured) {
    return NextResponse.json({ ...run, processing_configured: false }, { status: 201 });
  }

  try {
    const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
    const { external_job_id } = await triggerPipelineRun(pipeline.external_pipeline_id, {
      run_id: run.id,
      callback_url: `${baseUrl}/api/pipelines/webhook`,
      ...(droneFlightRecordId
        ? { drone_flight_record_id: droneFlightRecordId }
        : { input_file_url: `${baseUrl}/api/files/pipeline-datasets/${pipeline.sample_dataset_filename}` }),
      ...(farmCentroid ? { farm_centroid: farmCentroid } : {}),
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
