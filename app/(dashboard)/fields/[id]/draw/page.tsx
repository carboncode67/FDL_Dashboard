import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { canCreate, type Role } from "@/lib/roles";
import { EditBoundaryPage } from "./edit-boundary-client";

export default async function DrawBoundaryRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fieldId = parseInt(id);

  const session = await auth();
  const role = (session?.user?.role ?? "viewer") as Role;
  if (!canCreate(role)) notFound();

  const field = await prisma.field.findUnique({
    where: { id: fieldId },
    include: { Farm: true },
  });
  if (!field) notFound();

  return (
    <EditBoundaryPage
      fieldId={field.id}
      fieldName={field.Name ?? `Field #${field.id}`}
      farmId={field.Farm?.id ?? null}
      farmName={field.Farm?.Farm_Name ?? null}
      initialGeometry={field.geometry ?? null}
    />
  );
}
