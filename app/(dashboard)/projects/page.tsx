import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate, type Role } from "@/lib/roles";
import { getEffectiveScope } from "@/lib/get-user-filters";
import { ProjectsClient } from "./projects-client";

export default async function ProjectsPage() {
  const session = await auth();
  const role = (session?.user?.role ?? "viewer") as Role;
  const userId = session?.user?.id ?? null;

  const { projectIds, hardScoped } = await getEffectiveScope(userId, session?.user?.category);

  const projects = await prisma.project.findMany({
    where: projectIds.length > 0 ? { id: { in: projectIds } } : {},
    orderBy: { id: "asc" },
  });

  const data = projects.map((p) => ({
    id: p.id,
    Project_Name: p.Project_Name,
    Status: p.Status,
    Year_Started: p.Year_Started,
    Total_Budget: p.Total_Budget ? Number(p.Total_Budget) : null,
  }));

  return (
    <ProjectsClient
      data={data}
      canCreate={canCreate(role)}
      scopeNotice={hardScoped ? "Your access is scoped to your assigned project(s) by an admin." : null}
    />
  );
}
