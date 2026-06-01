import { prisma } from "@/lib/prisma";
import { DronesClient } from "./drones-client";

export default async function DronesPage() {
  const drones = await prisma.drone.findMany({ orderBy: { id: "asc" } });
  const data = drones.map((d) => ({
    id: d.id,
    Name: d.Name,
    Cost_Per_Acre: d.Cost_Per_Acre ? Number(d.Cost_Per_Acre) : null,
    Mobilization_Cost: d.Mobilization_Cost ? Number(d.Mobilization_Cost) : null,
    Description: d.Description,
  }));
  return <DronesClient data={data} />;
}
