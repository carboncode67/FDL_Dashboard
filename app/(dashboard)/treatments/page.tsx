import { prisma } from "@/lib/prisma";
import { TreatmentsClient } from "./treatments-client";

export default async function TreatmentsPage() {
  const treatments = await prisma.treatment.findMany({ orderBy: { id: "asc" } });
  const data = treatments.map((t) => ({
    id: t.id,
    Treatment_Name: t.Treatment_Name,
    Description: t.Description,
    Notes: t.Notes,
  }));
  return <TreatmentsClient data={data} />;
}
