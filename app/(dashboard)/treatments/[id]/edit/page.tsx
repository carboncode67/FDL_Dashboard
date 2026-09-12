import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import EditTreatmentClient from "./edit-client";
import { runWithTenant } from "@/lib/lab-db";

export default async function EditTreatmentPage({ params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const { id } = await params;
  const treatment = await prisma.treatment.findUnique({
    where: { id: parseInt(id) },
    include: { TreatmentFieldDefinitions: { orderBy: { col_index: "asc" } } },
  });
  if (!treatment) notFound();
  return (
    <EditTreatmentClient
      treatment={{
        id:               treatment.id,
        Treatment_Name:   treatment.Treatment_Name,
        Description:      treatment.Description,
        Notes:            treatment.Notes,
        allow_extra_rows: treatment.allow_extra_rows,
        TreatmentFieldDefinitions: treatment.TreatmentFieldDefinitions,
      }}
    />
  );
  });
}
