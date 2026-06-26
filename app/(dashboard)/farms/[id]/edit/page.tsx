import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import EditFarmClient from "./edit-client";

export default async function EditFarmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const farm = await prisma.farm.findUnique({ where: { id: parseInt(id) } });
  if (!farm) notFound();
  return (
    <EditFarmClient
      farm={{
        id: farm.id,
        Farm_Name: farm.Farm_Name,
        farm_summary: farm.farm_summary,
        is_active: farm.is_active,
        address: farm.address,
        latitude: farm.latitude,
        longitude: farm.longitude,
      }}
    />
  );
}
