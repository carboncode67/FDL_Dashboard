import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";
import { createHash } from "crypto";

export const runtime = "nodejs";

// The processing machine calls this when a registration test-run or a
// triggered run finishes. Configure PROCESSING_WEBHOOK_SECRET on both sides —
// same HMAC-over-body pattern as the CVAT webhook (app/api/annotations/webhook).

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";
const OUTPUT_RASTER_TYPE = "pipeline-outputs";

interface OutputFile { filename: string; download_url: string; kind?: "raster" | "file" }

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

// Pulls down every "raster"-kind output file (currently .tif/.tiff, see
// PipelineProcessor's main.py _collect_outputs) from the processing machine's own
// GET /outputs/{pipeline_id}/{filename} route and registers each as a
// Pipeline_Output_Rasters row, farm-linked so it shows up on that farm's map —
// same precedent as Context_Rasters (GeoDaRT pulls). Only called when the run
// resolved to a farm (see lib/pipeline-farm.ts / PipelineRun.farm_id) — a
// registration test-run against the pipeline's own sample dataset has no farm_id by
// design and never reaches here, so sample data never pollutes a farm's map.
// Best-effort: a download failure for one file logs and continues rather than
// failing the whole webhook response (the run itself already succeeded).
async function ingestOutputRasters(
  pipelineRunId: number,
  farmId: number,
  outputFiles: OutputFile[]
): Promise<void> {
  const rasters = outputFiles.filter((f) => f.kind === "raster");
  if (rasters.length === 0) return;

  const processingApiKey = process.env.PROCESSING_API_KEY;
  if (!processingApiKey) return; // processing not configured — nothing to authenticate the pull with

  const destDir = path.join(DATA_DIR, OUTPUT_RASTER_TYPE);
  fs.mkdirSync(destDir, { recursive: true });

  for (const file of rasters) {
    try {
      const res = await fetch(file.download_url, {
        headers: { Authorization: `Bearer ${processingApiKey}` },
      });
      if (!res.ok || !res.body) {
        console.error(`[pipelines webhook] failed to fetch output ${file.filename}: ${res.status}`);
        continue;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      const sha256 = createHash("sha256").update(buffer).digest("hex");
      const storedFilename = `${Date.now()}_${file.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      fs.writeFileSync(path.join(destDir, storedFilename), buffer);

      await prisma.pipelineOutputRaster.create({
        data: {
          pipeline_run_id: pipelineRunId,
          farm_id: farmId,
          filename: storedFilename,
          original_filename: file.filename,
          bytes: buffer.length,
          sha256,
        },
      });
    } catch (err) {
      console.error(`[pipelines webhook] error ingesting output ${file.filename}`, err);
    }
  }
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

    if (success && run.farm_id && payload.output_files) {
      await ingestOutputRasters(run.id, run.farm_id, payload.output_files);
    }

    return NextResponse.json({ ok: true, action: success ? "run_success" : "run_failed" });
  }

  return NextResponse.json({ ok: true, action: "ignored" });
}
