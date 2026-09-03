import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { canEdit, type Role } from "@/lib/roles";
import { EditGeofenceBoundaryPage } from "./edit-boundary-client";

export default async function DrawGeofenceBoundaryRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const geofenceId = parseInt(id);

  const session = await auth();
  const role = (session?.user?.role ?? "viewer") as Role;
  if (!canEdit(role)) notFound();

  const geofence = await prisma.geofence.findUnique({ where: { id: geofenceId } });
  if (!geofence) notFound();

  return (
    <EditGeofenceBoundaryPage
      geofenceId={geofence.id}
      geofenceTitle={geofence.title}
      initialGeometry={geofence.geometry}
    />
  );
}
