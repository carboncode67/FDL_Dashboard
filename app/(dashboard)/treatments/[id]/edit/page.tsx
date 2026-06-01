import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import EditTreatmentClient from "./edit-client";

export default async function EditTreatmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const treatment = await prisma.treatment.findUnique({ where: { id: parseInt(id) } });
  if (!treatment) notFound();
  return (
    <EditTreatmentClient
      treatment={{ id: treatment.id, Treatment_Name: treatment.Treatment_Name, Description: treatment.Description, Notes: treatment.Notes }}
    />
  );
}
