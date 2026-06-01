import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import EditDroneClient from "./edit-client";

export default async function EditDronePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const drone = await prisma.drone.findUnique({ where: { id: parseInt(id) } });
  if (!drone) notFound();
  return (
    <EditDroneClient
      drone={{
        id: drone.id,
        Name: drone.Name,
        Description: drone.Description,
        Cost_Per_Acre: drone.Cost_Per_Acre ? Number(drone.Cost_Per_Acre) : null,
        Mobilization_Cost: drone.Mobilization_Cost ? Number(drone.Mobilization_Cost) : null,
      }}
    />
  );
}
