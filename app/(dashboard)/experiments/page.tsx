import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate, type Role } from "@/lib/roles";
import { ExperimentsClient } from "./experiments-client";
import { format } from "date-fns";

export default async function ExperimentsPage() {
  const session = await auth();
  const role = (session?.user?.role ?? "viewer") as Role;
  const userId = session?.user?.id ?? null;

  const userFilterRecords = userId
    ? await prisma.userProjectFilter.findMany({
        where: { user_id: userId },
        select: { project_id: true },
      })
    : [];
  const filterIds = userFilterRecords.map((f) => f.project_id);
  const projectWhere = filterIds.length > 0 ? { project_id: { in: filterIds } } : undefined;

  const [experiments, filterProjects] = await Promise.all([
    prisma.farmExperiment.findMany({
      where: projectWhere,
      include: {
        Farm: {
          select: {
            id: true,
            Farm_Name: true,
            Contacts: { select: { name: true, is_lab_member: true }, orderBy: { name: "asc" } },
          },
        },
        Project: { select: { Project_Name: true } },
        CreatedBy: { select: { name: true } },
        ExperimentTreatments: {
          include: { Treatment: { select: { id: true, Treatment_Name: true } } },
        },
        ExperimentFields: {
          include: { Field: { select: { id: true, Name: true, geometry: true } } },
        },
      },
      orderBy: { farm_id: "asc" },
    }),
    filterIds.length > 0
      ? prisma.project.findMany({
          where: { id: { in: filterIds } },
          select: { id: true, Project_Name: true },
        })
      : Promise.resolve([]),
  ]);

  const activeProjectFilter =
    filterIds.length > 0
      ? {
          count: filterIds.length,
          names: filterProjects.map((p) => p.Project_Name ?? `Project ${p.id}`),
        }
      : null;

  const data = experiments.map((e) => {
    const farmer = e.Farm?.Contacts.find((c) => !c.is_lab_member);
    return {
      id: e.id,
      farm_id: e.farm_id,
      experiment_name: e.experiment_name,
      farm_name: e.Farm?.Farm_Name ?? null,
      farmer_name: farmer?.name ?? null,
      fields: e.ExperimentFields.map((ef) => ef.Field?.Name ?? "").filter(Boolean).join(", ") || null,
      field_geometries: e.ExperimentFields
        .filter((ef) => ef.Field?.geometry)
        .map((ef) => ({ id: ef.field_id, geometry: ef.Field!.geometry! })),
      treatments: e.ExperimentTreatments.map((t) => t.Treatment?.Treatment_Name ?? "").filter(Boolean),
      start_date: e.start_date ? format(new Date(e.start_date), "MMM d, yyyy") : null,
      end_date: e.end_date ? format(new Date(e.end_date), "MMM d, yyyy") : null,
      project_name: e.Project?.Project_Name ?? null,
      created_at: e.created_at.toISOString(),
      updated_at: e.updated_at.toISOString(),
      created_by_name: e.CreatedBy?.name ?? null,
    };
  });

  return (
    <ExperimentsClient
      data={data}
      canCreate={canCreate(role)}
      activeProjectFilter={activeProjectFilter}
    />
  );
}
