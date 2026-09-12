import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import EditProjectClient from "./edit-client";
import { runWithTenant } from "@/lib/lab-db";

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id: parseInt(id) } });
  if (!project) notFound();
  return (
    <EditProjectClient
      project={{
        id: project.id,
        Project_Name: project.Project_Name,
        Status: project.Status,
        Year_Started: project.Year_Started,
        Total_Budget: project.Total_Budget ? Number(project.Total_Budget) : null,
        Project_Sponsors: project.Project_Sponsors,
      }}
    />
  );
  });
}
