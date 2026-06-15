import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate, type Role } from "@/lib/roles";
import { ExperimentsClient } from "./experiments-client";
import { format } from "date-fns";

export default async function ExperimentsPage() {
  const [session, experiments] = await Promise.all([
    auth(),
    prisma.farmExperiment.findMany({
      include: {
        Farm: {
          select: {
            id: true,
            Farm_Name: true,
            Contacts: { select: { name: true, is_lab_member: true }, orderBy: { name: "asc" } },
          },
        },
        ExperimentTreatments: {
          include: { Treatment: { select: { id: true, Treatment_Name: true } } },
        },
        ExperimentFields: {
          include: { Field: { select: { id: true, Name: true, geometry: true } } },
        },
      },
      orderBy: { farm_id: "asc" },
    }),
  ]);

  const role = (session?.user?.role ?? "viewer") as Role;

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
    };
  });

  return <ExperimentsClient data={data} canCreate={canCreate(role)} />;
}
