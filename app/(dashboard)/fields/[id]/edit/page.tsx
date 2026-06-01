import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import EditFieldClient from "./edit-client";

export default async function EditFieldPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const field = await prisma.field.findUnique({ where: { id: parseInt(id) } });
  if (!field) notFound();
  return (
    <EditFieldClient
      field={{
        id: field.id,
        Name: field.Name,
        boundary_source: field.boundary_source,
        Farms_id: field.Farms_id,
      }}
    />
  );
}
