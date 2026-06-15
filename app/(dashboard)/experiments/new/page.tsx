import { prisma } from "@/lib/prisma";
import ExperimentNewClient from "./experiment-new-client";

export default async function NewExperimentPage() {
  const [farms, allTests, allDrones, allTreatments, allProjects] = await Promise.all([
    prisma.farm.findMany({ select: { id: true, Farm_Name: true }, orderBy: { Farm_Name: "asc" } }),
    prisma.test.findMany({ select: { id: true, Test_Name: true }, orderBy: { Test_Name: "asc" } }),
    prisma.drone.findMany({ select: { id: true, Name: true }, orderBy: { Name: "asc" } }),
    prisma.treatment.findMany({ select: { id: true, Treatment_Name: true }, orderBy: { Treatment_Name: "asc" } }),
    prisma.project.findMany({ select: { id: true, Project_Name: true }, orderBy: { Project_Name: "asc" } }),
  ]);

  return (
    <ExperimentNewClient
      farms={farms}
      allTests={allTests}
      allDrones={allDrones}
      allTreatments={allTreatments}
      allProjects={allProjects}
    />
  );
}
