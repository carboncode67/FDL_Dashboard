import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ASSIGNMENT_INCLUDE, resolveTargetLabel } from "@/lib/geofences";
import EditGeofenceClient from "./edit-client";

export default async function EditGeofencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const geofenceId = parseInt(id);

  const [geofence, assignments, contacts, users, farms, experiments] = await Promise.all([
    prisma.geofence.findUnique({ where: { id: geofenceId } }),
    prisma.geofenceAssignment.findMany({
      where: { geofence_id: geofenceId },
      include: ASSIGNMENT_INCLUDE,
      orderBy: { created_at: "asc" },
    }),
    prisma.contact.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    prisma.farm.findMany({ select: { id: true, Farm_Name: true }, orderBy: { Farm_Name: "asc" } }),
    prisma.farmExperiment.findMany({ select: { id: true, experiment_name: true }, orderBy: { experiment_name: "asc" } }),
  ]);

  if (!geofence) notFound();

  return (
    <EditGeofenceClient
      geofence={{
        id: geofence.id,
        title: geofence.title,
        description: geofence.description,
        geometry: geofence.geometry,
        action_message: geofence.action_message,
        is_active: geofence.is_active,
      }}
      assignments={assignments.map((a) => ({
        id: a.id,
        contact_id: a.contact_id,
        user_id: a.user_id,
        farm_id: a.farm_id,
        farm_experiment_id: a.farm_experiment_id,
        target_label: resolveTargetLabel(a),
      }))}
      contacts={contacts}
      users={users}
      farms={farms}
      experiments={experiments}
    />
  );
}
