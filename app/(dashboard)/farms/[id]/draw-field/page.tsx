import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { canCreate, type Role } from "@/lib/roles";
import { DrawFieldPage } from "./draw-field-client";

export default async function DrawFieldRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const farmId = parseInt(id);

  const session = await auth();
  const role = (session?.user?.role ?? "viewer") as Role;
  if (!canCreate(role)) notFound();

  const farm = await prisma.farm.findUnique({
    where: { id: farmId },
    include: { Fields: { select: { id: true, Name: true, geometry: true } } },
  });
  if (!farm) notFound();

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
    />
  );
}
