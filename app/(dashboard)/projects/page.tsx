import { prisma } from "@/lib/prisma";
import { ProjectsClient } from "./projects-client";

export default async function ProjectsPage() {
  const projects = await prisma.project.findMany({
    orderBy: { id: "asc" },
  });

  const data = projects.map((p) => ({
    id: p.id,
    Project_Name: p.Project_Name,
    Status: p.Status,
    Year_Started: p.Year_Started,
    Total_Budget: p.Total_Budget ? Number(p.Total_Budget) : null,
  }));

  return <ProjectsClient data={data} />;
}
