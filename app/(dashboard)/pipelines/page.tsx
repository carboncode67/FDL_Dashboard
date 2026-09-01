import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdmin, type Role } from "@/lib/roles";
import { PipelinesTabs } from "./pipelines-tabs";

export const metadata = { title: "Pipelines" };

export default async function PipelinesPage() {
  const session = await auth();
  const role = (session?.user?.role ?? "viewer") as Role;

  const [pipelines, projects, dataTables, runs] = await Promise.all([
    prisma.pipeline.findMany({
      include: {
        Creator: { select: { id: true, name: true, email: true } },
        _count: { select: { Runs: true } },
      },
      orderBy: { created_at: "desc" },
    }),
    prisma.project.findMany({ select: { id: true, Project_Name: true }, orderBy: { Project_Name: "asc" } }),
    prisma.dataTable.findMany({
      select: {
        id: true, name: true, description: true, sample_original_name: true,
        _count: { select: { FieldDefinitions: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.pipelineRun.findMany({
      include: { Pipeline: { select: { name: true } } },
      orderBy: { created_at: "desc" },
      take: 200,
    }),
  ]);

  return (
    <PipelinesTabs
      initialPipelines={pipelines.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        status: p.status,
        target_kind: p.target_kind,
        match_table: p.match_table,
        match_category: p.match_category,
        match_project_id: p.match_project_id,
        match_data_table_id: p.match_data_table_id,
        use_spatial_context: p.use_spatial_context,
        wired_command: p.wired_command,
        last_run_at: p.last_run_at?.toISOString() ?? null,
        last_run_status: p.last_run_status,
        creator_name: p.Creator?.name ?? p.Creator?.email ?? "Deleted user",
        run_count: p._count.Runs,
        created_at: p.created_at.toISOString(),
      }))}
      projects={projects.map((p) => ({ id: p.id, name: p.Project_Name ?? `Project #${p.id}` }))}
      dataTables={dataTables.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        columnCount: t._count.FieldDefinitions,
        hasSample: !!t.sample_original_name,
      }))}
      runs={runs.map((r) => ({
        id: r.id,
        pipeline_id: r.pipeline_id,
        pipeline_name: r.Pipeline.name,
        is_test_run: r.is_test_run,
        status: r.status,
        prompt: r.prompt,
        processor_note: r.processor_note,
        error_message: r.error_message,
        output_files: (r.output_files as { filename: string; download_url: string }[]) ?? [],
        output_storage_path: r.output_storage_path,
        stdout_log: r.stdout_log,
        stderr_log: r.stderr_log,
        trigger_upload_table: r.trigger_upload_table,
        trigger_data_table_id: r.trigger_data_table_id,
        target_drone_flight_id: r.target_drone_flight_id,
        started_at: r.started_at?.toISOString() ?? null,
        finished_at: r.finished_at?.toISOString() ?? null,
        created_at: r.created_at.toISOString(),
      }))}
      isAdmin={isAdmin(role)}
    />
  );
}
