import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate, type Role } from "@/lib/roles";
import { FarmsClient } from "./farms-client";

export default async function FarmsPage() {
  const [session, farms] = await Promise.all([
    auth(),
    prisma.farm.findMany({
      orderBy: { Farm_Name: "asc" },
      include: { Contacts: { where: { is_lab_member: false }, orderBy: { id: "asc" }, take: 1 } },
    }),
  ]);
  const role = (session?.user?.role ?? "viewer") as Role;
  const data = farms.map((f) => ({
    id: f.id,
    Farm_Name: f.Farm_Name,
    Farmer_Name: f.Contacts[0]?.name ?? null,
    is_active: f.is_active,
    created_at: f.created_at ? f.created_at.toISOString() : null,
    updated_at: f.updated_at ? f.updated_at.toISOString() : null,
  }));
  return <FarmsClient data={data} canCreate={canCreate(role)} />;
}
