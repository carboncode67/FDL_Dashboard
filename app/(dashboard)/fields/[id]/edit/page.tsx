import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveScope, scopeIncludesFarm } from "@/lib/get-user-filters";
import EditFieldClient from "./edit-client";
import { runWithTenant } from "@/lib/lab-db";

export default async function EditFieldPage({ params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const { id } = await params;
  const field = await prisma.field.findUnique({ where: { id: parseInt(id) } });
  if (!field) notFound();
  const session = await auth();
  const scope = await getEffectiveScope(session?.user?.id ?? null, session?.user?.category);
  if (!scopeIncludesFarm(scope, field.Farms_id)) notFound();
  return (
    <EditFieldClient
      field={{
        id: field.id,
        Name: field.Name,
        boundary_source: field.boundary_source,
        Farms_id: field.Farms_id,
      }}
    />
  );
  });
}
