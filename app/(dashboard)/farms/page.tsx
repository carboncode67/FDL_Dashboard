import { prisma } from "@/lib/prisma";
import { FarmsClient } from "./farms-client";

export default async function FarmsPage() {
  const farms = await prisma.farm.findMany({ orderBy: { id: "asc" } });
  const data = farms.map((f) => ({
    id: f.id,
    Farm_Name: f.Farm_Name,
    Farmer_Name: f.Farmer_Name,
    County: f.County,
    State: f.State,
    Contact_Phone: f.Contact_Phone,
    Contact_Email: f.Contact_Email,
  }));
  return <FarmsClient data={data} />;
}
