import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate, type Role } from "@/lib/roles";
import { getUserFilters } from "@/lib/get-user-filters";
import { FarmsClient } from "./farms-client";

export default async function FarmsPage() {
  const session = await auth();
  const role = (session?.user?.role ?? "viewer") as Role;
  const userId = session?.user?.id ?? null;

  const { farmIds } = await getUserFilters(userId);

  const farmWhere = farmIds.length > 0 ? { id: { in: farmIds } } : {};

  const activeFilter = farmIds.length > 0 ? { projectCount: 0, farmCount: farmIds.length } : null;

  const farms = await prisma.farm.findMany({
    where: farmWhere,
    orderBy: { Farm_Name: "asc" },
    include: { Contacts: { where: { is_lab_member: false }, orderBy: { id: "asc" }, take: 1 } },
  });

  const data = farms.map((f) => ({
    id: f.id,
    Farm_Name: f.Farm_Name,
    Farmer_Name: f.Contacts[0]?.name ?? null,
    is_active: f.is_active,
    created_at: f.created_at ? f.created_at.toISOString() : null,
    updated_at: f.updated_at ? f.updated_at.toISOString() : null,
  }));

  return <FarmsClient data={data} canCreate={canCreate(role)} activeFilter={activeFilter} />;
}
