import { prisma } from "@/lib/prisma";
import { FieldsClient } from "./fields-client";

export default async function FieldsPage() {
  const fields = await prisma.field.findMany({
    orderBy: { id: "asc" },
    include: { Farm: true },
  });

  const data = fields.map((f) => ({
    id: f.id,
    Name: f.Name,
    Farm_Name: f.Farm?.Farm_Name ?? null,
    boundary_source: f.boundary_source,
    hasGeometry: !!f.geometry,
  }));

  return <FieldsClient data={data} />;
}
