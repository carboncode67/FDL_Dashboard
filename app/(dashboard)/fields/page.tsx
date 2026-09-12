import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate, type Role } from "@/lib/roles";
import { getEffectiveScope } from "@/lib/get-user-filters";
import { FieldsClient } from "./fields-client";
import { runWithTenant } from "@/lib/lab-db";

export default async function FieldsPage() {
  return runWithTenant(async () => {
  const session = await auth();
  const role = (session?.user?.role ?? "viewer") as Role;
  const userId = session?.user?.id ?? null;

  const { farmIds } = await getEffectiveScope(userId, session?.user?.category);

  const fieldWhere = farmIds.length > 0 ? { Farms_id: { in: farmIds } } : {};

  const activeFilter = farmIds.length > 0 ? { projectCount: 0, farmCount: farmIds.length } : null;

  const fields = await prisma.field.findMany({
    where: fieldWhere,
    orderBy: { id: "asc" },
    include: { Farm: true },
  });

  const data = fields.map((f) => ({
    id: f.id,
    Name: f.Name,
    Farm_Name: f.Farm?.Farm_Name ?? null,
    boundary_source: f.boundary_source,
    hasGeometry: !!f.geometry,
  }));

  return <FieldsClient data={data} canCreate={canCreate(role)} activeFilter={activeFilter} />;
  });
}
