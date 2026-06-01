import { prisma } from "@/lib/prisma";
import { ExperimentZonesClient } from "./experiment-zones-client";

export default async function ExperimentZonesPage() {
  const zones = await prisma.experimentZone.findMany({
    orderBy: { id: "asc" },
    include: { Project: true, Farm: true, Field: true },
  });

  const data = zones.map((z) => ({
    id: z.id,
    Zone_Label: z.Zone_Label,
    Project_Name: z.Project?.Project_Name ?? null,
    Farm_Name: z.Farm?.Farm_Name ?? null,
    Field_Name: z.Field?.Name ?? null,
    Rep_Number: z.Rep_Number,
    hasGeometry: !!z.geometry,
  }));

  return <ExperimentZonesClient data={data} />;
}
