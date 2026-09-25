import { prisma } from "@/lib/prisma";
import { DronesClient } from "./drones-client";
import { runWithTenant } from "@/lib/lab-db";

export default async function DronesPage() {
  return runWithTenant(async () => {
  const [drones, contacts, users] = await Promise.all([
    prisma.drone.findMany({
      orderBy: { id: "asc" },
      include: {
        EquipmentLoans: {
          where: { returned_at: null },
          include: { Contact: true, RenterUser: true },
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
    prisma.user.findMany({
      select: { id: true, name: true, email: true, category: true },
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
      renterName: loan.Contact?.name ?? loan.RenterUser?.name ?? loan.RenterUser?.email ?? "Unknown",
      signedOutAt: loan.signed_out_at.toISOString(),
      dueAt: loan.due_at.toISOString(),
    })),
    requiredByTests: d.RequiredByTests.map((r) => r.Test.Test_Name ?? `Test #${r.Tests_id}`),
    methodology: d.MethodologyLibrary ? { id: d.MethodologyLibrary.id, title: d.MethodologyLibrary.title } : null,
  }));

  return <DronesClient data={data} contacts={contacts} users={users} />;
  });
}
