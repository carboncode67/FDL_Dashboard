import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdmin, type Role } from "@/lib/roles";
import { PipelineDetailClient } from "./pipeline-detail-client";

export default async function PipelineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const role = (session?.user?.role ?? "viewer") as Role;

  const [pipeline, droneFlights] = await Promise.all([
    prisma.pipeline.findUnique({
      where: { id: parseInt(id) },
      include: {
        Creator: { select: { id: true, name: true, email: true } },
        Runs: { orderBy: { created_at: "desc" } },
      },
    }),
    prisma.droneFlightRecord.findMany({
      include: {
        ExperimentDroneFlight: {
          include: {
            Drone: { select: { id: true, Name: true } },
            Experiment: {
              select: { id: true, experiment_name: true, Farm: { select: { id: true, Farm_Name: true } } },
            },
          },
        },
      },
      orderBy: [{ flight_date: "desc" }, { created_at: "desc" }],
    }),
  ]);
  if (!pipeline) notFound();

  return (
    <PipelineDetailClient
      pipeline={{
        id: pipeline.id,
        name: pipeline.name,
        description: pipeline.description,
        status: pipeline.status,
        target_kind: pipeline.target_kind,
        match_table: pipeline.match_table,
        match_category: pipeline.match_category,
        match_project_id: pipeline.match_project_id,
        match_data_table_id: pipeline.match_data_table_id,
        use_spatial_context: pipeline.use_spatial_context,
        sample_dataset_original_name: pipeline.sample_dataset_original_name,
        sample_dataset_filename: pipeline.sample_dataset_filename,
        script_original_name: pipeline.script_original_name,
        script_filename: pipeline.script_filename,
        model_original_name: pipeline.model_original_name,
        model_filename: pipeline.model_filename,
        wired_command: pipeline.wired_command,
        wired_requirements: pipeline.wired_requirements,
        llm_notes: pipeline.llm_notes,
        external_pipeline_id: pipeline.external_pipeline_id,
        creator_name: pipeline.Creator?.name ?? pipeline.Creator?.email ?? "Deleted user",
        created_at: pipeline.created_at.toISOString(),
        runs: pipeline.Runs.map((r) => ({
          id: r.id,
          is_test_run: r.is_test_run,
          status: r.status,
          stdout_log: r.stdout_log,
          stderr_log: r.stderr_log,
          output_files: r.output_files as { filename: string; download_url: string }[],
          output_storage_path: r.output_storage_path,
          error_message: r.error_message,
          started_at: r.started_at?.toISOString() ?? null,
          finished_at: r.finished_at?.toISOString() ?? null,
          created_at: r.created_at.toISOString(),
        })),
      }}
      droneFlights={droneFlights.map((r) => ({
        id: r.id,
        label: [
          r.ExperimentDroneFlight.Experiment?.Farm?.Farm_Name,
          r.ExperimentDroneFlight.Experiment?.experiment_name,
          r.ExperimentDroneFlight.Drone.Name,
          r.flight_date ? r.flight_date.toISOString().slice(0, 10) : "no date",
        ].filter(Boolean).join(" / "),
      }))}
      isAdmin={isAdmin(role)}
    />
  );
}
