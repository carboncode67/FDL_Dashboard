import { prisma } from "@/lib/prisma";
import NewZoneClient from "./new-zone-client";

export default async function NewExperimentZonePage() {
  const fields = await prisma.field.findMany({
    select: { id: true, Name: true },
    orderBy: { id: "asc" },
  });

  const fieldOptions = fields.map((f) => ({
    id: f.id,
    name: f.Name ?? `Field #${f.id}`,
  }));

  return <NewZoneClient fields={fieldOptions} />;
}
