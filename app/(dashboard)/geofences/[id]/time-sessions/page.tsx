import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import TimeSessionsClient from "./time-sessions-client";
import { runWithTenant } from "@/lib/lab-db";

export default async function GeofenceTimeSessionsPage({ params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const { id } = await params;
  const geofenceId = parseInt(id);

  const [geofence, sessions] = await Promise.all([
    prisma.geofence.findUnique({ where: { id: geofenceId } }),
    prisma.geofenceZoneTimeSession.findMany({
      where: { geofence_id: geofenceId },
      include: {
        Contact: { select: { name: true } },
        User: { select: { name: true, email: true } },
        Field: { select: { Name: true } },
        Zone: { include: { Farm: { select: { Farm_Name: true } } } },
      },
      orderBy: { received_at: "desc" },
    }),
  ]);

  if (!geofence) notFound();

  return (
    <TimeSessionsClient
      geofence={{ id: geofence.id, title: geofence.title }}
      sessions={sessions.map((s) => ({
        id: s.id,
        recipient: s.Contact?.name ?? s.User?.name ?? s.User?.email ?? "Unknown",
        field_name: s.field_id === null ? null : (s.Field?.Name ?? `Field #${s.field_id}`),
        farm_name: s.Zone.Farm.Farm_Name ?? `Farm #${s.Zone.farm_id}`,
        entered_at: s.entered_at.toISOString(),
        exited_at: s.exited_at.toISOString(),
        duration_seconds: s.duration_seconds,
        received_at: s.received_at.toISOString(),
      }))}
    />
  );
  });
}
