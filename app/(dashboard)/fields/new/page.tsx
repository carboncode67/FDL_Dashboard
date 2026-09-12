import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getEffectiveScope } from "@/lib/get-user-filters";
import { NewFieldsClient } from "./new-fields-client";
import { runWithTenant } from "@/lib/lab-db";

export default async function NewFieldPage({
  searchParams,
}: {
  searchParams: Promise<{ farmId?: string }>;
}) {
  return runWithTenant(async () => {
  const { farmId } = await searchParams;
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const { farmIds } = await getEffectiveScope(userId, session?.user?.category);

  const farms = await prisma.farm.findMany({
    where: farmIds.length > 0 ? { id: { in: farmIds } } : {},
    orderBy: { Farm_Name: "asc" },
    select: { id: true, Farm_Name: true },
  });

  return (
    <NewFieldsClient
      farms={farms.map((f) => ({ id: f.id, name: f.Farm_Name ?? `Farm #${f.id}` }))}
      defaultFarmId={farmId ? parseInt(farmId) : undefined}
    />
  );
  });
}
