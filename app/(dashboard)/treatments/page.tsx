import { prisma } from "@/lib/prisma";
import { TreatmentsClient } from "./treatments-client";
import { runWithTenant } from "@/lib/lab-db";

export default async function TreatmentsPage() {
  return runWithTenant(async () => {
  const treatments = await prisma.treatment.findMany({
    orderBy: { Treatment_Name: "asc" },
    include: { TreatmentFieldDefinitions: { orderBy: { col_index: "asc" } } },
  });
  const data = treatments.map((t) => ({
    id:              t.id,
    Treatment_Name:  t.Treatment_Name,
    Description:     t.Description,
    allow_extra_rows: t.allow_extra_rows,
    fieldLabels:     t.TreatmentFieldDefinitions.map((d) => d.label),
  }));
  return <TreatmentsClient data={data} />;
  });
}
