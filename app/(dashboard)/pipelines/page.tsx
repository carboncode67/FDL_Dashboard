import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdmin, type Role } from "@/lib/roles";
import { PipelinesClient } from "./pipelines-client";

export const metadata = { title: "Pipelines" };

export default async function PipelinesPage() {
  const session = await auth();
  const role = (session?.user?.role ?? "viewer") as Role;

  const [pipelines, projects, tests] = await Promise.all([
    prisma.pipeline.findMany({
      include: {
        Creator: { select: { id: true, name: true, email: true } },
        _count: { select: { Runs: true } },
      },
      orderBy: { created_at: "desc" },
    }),
    prisma.project.findMany({ select: { id: true, Project_Name: true }, orderBy: { Project_Name: "asc" } }),
    prisma.test.findMany({ select: { id: true, Test_Name: true }, orderBy: { Test_Name: "asc" } }),
  ]);

  return (
    <PipelinesClient
      initialPipelines={pipelines.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        status: p.status,
        match_table: p.match_table,
        match_category: p.match_category,
        match_project_id: p.match_project_id,
        match_test_id: p.match_test_id,
        wired_command: p.wired_command,
        last_run_at: p.last_run_at?.toISOString() ?? null,
        last_run_status: p.last_run_status,
        creator_name: p.Creator?.name ?? p.Creator?.email ?? "Deleted user",
        run_count: p._count.Runs,
        created_at: p.created_at.toISOString(),
      }))}
      projects={projects.map((p) => ({ id: p.id, name: p.Project_Name ?? `Project #${p.id}` }))}
      tests={tests.map((t) => ({ id: t.id, name: t.Test_Name ?? `Test #${t.id}` }))}
      isAdmin={isAdmin(role)}
    />
  );
}
