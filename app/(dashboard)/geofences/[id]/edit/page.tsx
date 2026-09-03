import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ASSIGNMENT_INCLUDE, resolveTargetLabel } from "@/lib/geofences";
import EditGeofenceClient from "./edit-client";

export default async function EditGeofencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const geofenceId = parseInt(id);

  const [geofence, assignments, contacts, users, farms, experiments] = await Promise.all([
    prisma.geofence.findUnique({
      where: { id: geofenceId },
      include: {
        Zones: {
          include: {
            Farm: { select: { Farm_Name: true } },
            Fields: { include: { Field: { select: { id: true, Name: true } } } },
          },
        },
      },
    }),
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
        action_message: geofence.action_message,
        is_active: geofence.is_active,
        notify_on_circle_entry: geofence.notify_on_circle_entry,
        notify_on_field_entry: geofence.notify_on_field_entry,
      }}
      zones={geofence.Zones.map((z) => ({
        id: z.id,
        farm_name: z.Farm.Farm_Name ?? `Farm #${z.farm_id}`,
        radius_meters: z.radius_meters,
        field_names: z.Fields.map((zf) => zf.Field.Name ?? `Field #${zf.Field.id}`),
      }))}
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
