import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import EditZoneClient from "./edit-client";

export default async function EditZonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [zone, fields] = await Promise.all([
    prisma.experimentZone.findUnique({ where: { id: parseInt(id) } }),
    prisma.field.findMany({ select: { id: true, Name: true }, orderBy: { id: "asc" } }),
  ]);

  if (!zone) notFound();

  return (
    <EditZoneClient
      zone={{ id: zone.id, Zone_Label: zone.Zone_Label, Rep_Number: zone.Rep_Number, Fields_id: zone.Fields_id }}
      fields={fields.map((f) => ({ id: f.id, name: f.Name ?? `Field #${f.id}` }))}
    />
  );
}
