import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { canCreate, canDelete, type Role } from "@/lib/roles";
import { getEditMode } from "@/lib/edit-mode";
import { getEffectiveScope, scopeIncludesFarm } from "@/lib/get-user-filters";
import { DrawFieldPage } from "./draw-field-client";
import { runWithTenant } from "@/lib/lab-db";

export default async function DrawFieldRoute({ params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const { id } = await params;
  const farmId = parseInt(id);

  const [session, editMode] = await Promise.all([auth(), getEditMode()]);
  const role = (session?.user?.role ?? "viewer") as Role;
  if (!canCreate(role)) notFound();

  const farm = await prisma.farm.findUnique({
    where: { id: farmId },
    include: { Fields: { select: { id: true, Name: true, geometry: true } } },
  });
  if (!farm) notFound();
  const scope = await getEffectiveScope(session?.user?.id ?? null, session?.user?.category);
  if (!scopeIncludesFarm(scope, farm.id)) notFound();

  return (
    <DrawFieldPage
      farmId={farm.id}
      farmName={farm.Farm_Name ?? `Farm #${farm.id}`}
      existingFields={farm.Fields.map((f) => ({
        id: f.id,
        name: f.Name ?? `Field #${f.id}`,
        geometry: f.geometry ?? null,
      }))}
      farmLat={farm.latitude ?? undefined}
      farmLng={farm.longitude ?? undefined}
      canDeleteFields={canDelete(role, editMode)}
    />
  );
  });
}
