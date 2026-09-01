import { prisma } from "@/lib/prisma";
import { DronesClient } from "./drones-client";

export default async function DronesPage() {
  const [drones, contacts] = await Promise.all([
    prisma.drone.findMany({
      orderBy: { id: "asc" },
      include: {
        EquipmentLoans: {
          where: { returned_at: null },
          include: { Contact: true },
          orderBy: { due_at: "asc" },
        },
        RequiredByTests: { include: { Test: true } },
        MethodologyLibrary: { select: { id: true, title: true } },
      },
    }),
    prisma.contact.findMany({
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const data = drones.map((d) => ({
    id: d.id,
    Name: d.Name,
    Cost_Per_Acre: d.Cost_Per_Acre ? Number(d.Cost_Per_Acre) : null,
    Mobilization_Cost: d.Mobilization_Cost ? Number(d.Mobilization_Cost) : null,
    Description: d.Description,
    quantity: d.quantity,
    activeLoans: d.EquipmentLoans.map((loan) => ({
      id: loan.id,
      contactName: loan.Contact.name,
      signedOutAt: loan.signed_out_at.toISOString(),
      dueAt: loan.due_at.toISOString(),
    })),
    requiredByTests: d.RequiredByTests.map((r) => r.Test.Test_Name ?? `Test #${r.Tests_id}`),
    methodology: d.MethodologyLibrary ? { id: d.MethodologyLibrary.id, title: d.MethodologyLibrary.title } : null,
  }));

  return <DronesClient data={data} contacts={contacts} />;
}
