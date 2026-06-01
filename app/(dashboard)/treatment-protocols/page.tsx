import { prisma } from "@/lib/prisma";
import { TreatmentProtocolsClient } from "./treatment-protocols-client";

export default async function TreatmentProtocolsPage() {
  const protocols = await prisma.treatmentProtocol.findMany({
    orderBy: { id: "asc" },
    include: { Project: true, Treatment: true },
  });

  const data = protocols.map((p) => ({
    id: p.id,
    Protocol_Name: p.Protocol_Name,
    Project_Name: p.Project?.Project_Name ?? null,
    Treatment_Name: p.Treatment?.Treatment_Name ?? null,
    Product: p.Product,
    Is_Control: p.Is_Control,
  }));

  return <TreatmentProtocolsClient data={data} />;
}
