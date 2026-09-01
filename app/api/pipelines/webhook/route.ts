import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// The processing machine calls this when a registration test-run or a
// triggered run finishes. Configure PROCESSING_WEBHOOK_SECRET on both sides —
// same HMAC-over-body pattern as the CVAT webhook (app/api/annotations/webhook).

interface OutputFile { filename: string; download_url: string }

interface ProcessingWebhookPayload {
  event: "pipeline_registered" | "pipeline_failed" | "run_completed" | "run_failed";
  pipeline_id: number;
  run_id?: number;
  external_job_id?: string;
  wired_command?: string;
  wired_requirements?: string;
  llm_notes?: string;
  processor_note?: string; // short per-run status the processor emits ("CRS unclear")
  stdout_log?: string;
  stderr_log?: string;
  output_files?: OutputFile[];
  output_storage_path?: string; // set for target_kind = "drone_flight" runs — final zraid1 path
  error_message?: string;
}

export async function POST(req: Request) {
  const secret = process.env.PROCESSING_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const sig = req.headers.get("x-signature-256") ?? "";
  const body = await req.text();
  const { createHmac, timingSafeEqual } = await import("crypto");
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload: ProcessingWebhookPayload = JSON.parse(body);
  return handlePayload(payload);
}

async function handlePayload(payload: ProcessingWebhookPayload) {
  const pipeline = await prisma.pipeline.findUnique({ where: { id: payload.pipeline_id } });
  if (!pipeline) return NextResponse.json({ ok: true, action: "pipeline_not_found" });

  if (payload.event === "pipeline_registered" || payload.event === "pipeline_failed") {
    const success = payload.event === "pipeline_registered";
    await prisma.pipeline.update({
      where: { id: pipeline.id },
      data: {
        status: success ? "live" : "failed",
        wired_command: payload.wired_command ?? pipeline.wired_command,
        wired_requirements: payload.wired_requirements ?? pipeline.wired_requirements,
        llm_notes: payload.llm_notes ?? pipeline.llm_notes,
        last_run_at: new Date(),
        last_run_status: success ? "success" : "failed",
      },
    });

    // Record the registration's sample-dataset test run as run history.
    await prisma.pipelineRun.create({
      data: {
        pipeline_id: pipeline.id,
        is_test_run: true,
        status: success ? "success" : "failed",
        external_job_id: payload.external_job_id ?? null,
        stdout_log: payload.stdout_log ?? null,
        stderr_log: payload.stderr_log ?? null,
        output_files: (payload.output_files ?? []) as object[],
        error_message: payload.error_message ?? null,
        processor_note: payload.processor_note ?? payload.llm_notes ?? null,
        started_at: new Date(),
        finished_at: new Date(),
      },
    });

    return NextResponse.json({ ok: true, action: success ? "live" : "failed" });
  }

  if (payload.event === "run_completed" || payload.event === "run_failed") {
    if (!payload.run_id) return NextResponse.json({ ok: true, action: "ignored" });
    const success = payload.event === "run_completed";

    const run = await prisma.pipelineRun.findUnique({ where: { id: payload.run_id } });
    if (!run || run.pipeline_id !== pipeline.id) {
      return NextResponse.json({ ok: true, action: "run_not_found" });
    }

    await prisma.pipelineRun.update({
      where: { id: run.id },
      data: {
        status: success ? "success" : "failed",
        stdout_log: payload.stdout_log ?? null,
        stderr_log: payload.stderr_log ?? null,
        output_files: (payload.output_files ?? []) as object[],
        output_storage_path: payload.output_storage_path ?? null,
        error_message: payload.error_message ?? null,
        processor_note: payload.processor_note ?? null,
        finished_at: new Date(),
      },
    });
    await prisma.pipeline.update({
      where: { id: pipeline.id },
      data: { last_run_at: new Date(), last_run_status: success ? "success" : "failed" },
    });

    // Drone-flight runs organize imagery straight onto zraid1 with no human in the
    // loop — auto-fill the flight record's storage path from the run result instead
    // of making someone type it in by hand (the pre-pipeline manual workflow).
    if (success && run.target_drone_flight_id && payload.output_storage_path) {
      await prisma.droneFlightRecord.update({
        where: { id: run.target_drone_flight_id },
        data: { data_storage_path: payload.output_storage_path },
      });
    }

    return NextResponse.json({ ok: true, action: success ? "run_success" : "run_failed" });
  }

  return NextResponse.json({ ok: true, action: "ignored" });
}
