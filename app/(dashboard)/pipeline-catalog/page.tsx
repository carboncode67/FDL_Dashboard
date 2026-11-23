import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canEdit, isAdmin, type Role } from "@/lib/roles";
import { effectiveLabSlug, runWithLab } from "@/lib/lab-db";
import { agentLabId } from "@/lib/agent/admin";
import { getEffectiveScope } from "@/lib/get-user-filters";
import { fetchPipelineCatalog, processingConfigured } from "@/lib/processing";
import { CatalogClient } from "./catalog-client";

export const metadata = { title: "Pipeline catalogue" };

// Declarative pipelines (docs/pipeline-requests-plan.md, phase 2): what the
// processing machine can run (reviewed definitions), a run form, and recent
// runs. New pipelines start as requests at /pipeline-requests.
export default async function PipelineCatalogPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const slug = await effectiveLabSlug(session);
  const labId = await agentLabId(session, slug);
  return runWithLab(slug, async () => {
    const scope = await getEffectiveScope(session.user.id ?? null, session.user.category);
    const farmWhere = scope.hardScoped ? { id: { in: scope.accessFarmIds } } : {};
    const [catalog, farms, runs, triggers, projects, dataTables] = await Promise.all([
      fetchPipelineCatalog(),
      prisma.farm.findMany({ where: farmWhere, select: { id: true, Farm_Name: true }, orderBy: { Farm_Name: "asc" } }),
      labId == null ? [] : prisma.pipelineRunV2.findMany({
        where: { lab_id: labId, ...(scope.hardScoped ? { farm_id: { in: scope.accessFarmIds } } : {}) },
        orderBy: { created_at: "desc" }, take: 50, include: { Farm: { select: { Farm_Name: true } } },
      }),
      labId == null ? [] : prisma.pipelineTrigger.findMany({ where: { lab_id: labId }, orderBy: { id: "asc" } }),
      prisma.project.findMany({ select: { id: true, Project_Name: true }, orderBy: { Project_Name: "asc" } }),
      prisma.dataTable.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return (
      <div className="max-w-5xl space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Pipeline catalogue</h2>
          <p className="text-sm text-stone-500">
            Reviewed pipelines the processing machine can run. Missing one?{" "}
            <Link href="/pipeline-requests/new" className="text-blue-700 hover:underline">Request it</Link>.
          </p>
        </div>
        <CatalogClient
          configured={processingConfigured}
          catalog={catalog}
          farms={farms.map((f) => ({ id: f.id, name: f.Farm_Name ?? `Farm ${f.id}` }))}
          runs={runs.map((r) => ({
            id: r.id, key: r.pipeline_key, name: r.pipeline_name, version: r.pipeline_version, status: r.status,
            farm_id: r.farm_id, farm_name: r.Farm?.Farm_Name ?? null, error_message: r.error_message,
            steps: (r.steps ?? []) as { id: string; op: string; status: string; seconds?: number; error?: string; notes?: string[] }[],
            outputs: (r.outputs ?? []) as { name: string; kind: string; farm_layer_id?: number; basemap_id?: number; document_id?: number; error?: string }[],
            created_at: r.created_at.toISOString(),
            trigger: r.trigger_table ? `${r.trigger_table} #${r.trigger_id}` : null,
          }))}
          canRun={canEdit((session.user.role ?? "viewer") as Role)}
          isAdmin={isAdmin((session.user.role ?? "viewer") as Role)}
          triggers={triggers.map((t) => ({
            id: t.id, pipeline_key: t.pipeline_key, trigger_input: t.trigger_input, match_table: t.match_table,
            match_category: t.match_category, match_project_id: t.match_project_id, match_data_table_id: t.match_data_table_id,
            params: (t.params ?? {}) as Record<string, unknown>, enabled: t.enabled,
          }))}
          projects={projects.map((x) => ({ id: x.id, name: x.Project_Name ?? `Project ${x.id}` }))}
          dataTables={dataTables.map((x) => ({ id: x.id, name: x.name }))}
        />
      </div>
    );
  });
}
