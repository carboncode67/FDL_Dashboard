import { prisma } from "@/lib/prisma";
import NewContactClient from "./new-contact-client";

export default async function NewContactPage() {
  const farms = await prisma.farm.findMany({
    select: { id: true, Farm_Name: true },
    orderBy: { id: "asc" },
  });
  const farmOptions = farms.map((f) => ({ id: f.id, name: f.Farm_Name ?? `Farm #${f.id}` }));
  return <NewContactClient farms={farmOptions} />;
}
