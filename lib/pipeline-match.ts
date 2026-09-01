import { prisma } from "@/lib/prisma";
import { processingConfigured, triggerPipelineRun } from "@/lib/processing";
import type { Prisma } from "@prisma/client";

export interface MatchTriggerOpts {
  table: string;
  id: number;
  category?: string | null;
  project_id?: number | null;
  data_table_id?: number | null;
  inputFileUrl: string;
}

// Nullable match_* fields act as wildcards: a pipeline with match_category = null
// matches uploads of any category. An upload with no value in a dimension only
// matches pipelines that are wildcard on that dimension.
function scopeFilter(
  field: "match_category" | "match_project_id" | "match_data_table_id",
  value: string | number | null
): Prisma.PipelineWhereInput {
  if (value === null) return { [field]: null };
  return { OR: [{ [field]: null }, { [field]: value }] };
}

// Called from mutation points where an upload becomes "categorized enough to
// match" (Data Sorting save, Test data row ingestion). Best-effort and
// non-blocking — a processing-machine failure must never fail the caller's request.
export async function matchAndTriggerPipelines(opts: MatchTriggerOpts): Promise<void> {
  if (!processingConfigured) return;

  const pipelines = await prisma.pipeline.findMany({
    where: {
      status: "live",
      match_table: opts.table,
      AND: [
        scopeFilter("match_category", opts.category ?? null),
        scopeFilter("match_project_id", opts.project_id ?? null),
        scopeFilter("match_data_table_id", opts.data_table_id ?? null),
      ],
    },
  });

  const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");

  for (const pipeline of pipelines) {
    if (!pipeline.external_pipeline_id) continue;

    const run = await prisma.pipelineRun.create({
      data: {
        pipeline_id: pipeline.id,
        trigger_upload_id: opts.id,
        trigger_upload_table: opts.table,
        trigger_data_table_id: opts.data_table_id ?? null,
        status: "queued",
      },
    });

    try {
      const { external_job_id } = await triggerPipelineRun(pipeline.external_pipeline_id, {
        run_id: run.id,
        input_file_url: opts.inputFileUrl,
        callback_url: `${baseUrl}/api/pipelines/webhook`,
      });
      await prisma.pipelineRun.update({
        where: { id: run.id },
        data: { status: "running", external_job_id, started_at: new Date() },
      });
    } catch (err) {
      await prisma.pipelineRun.update({
        where: { id: run.id },
        data: { status: "failed", error_message: err instanceof Error ? err.message : String(err) },
      });
    }
  }
}
