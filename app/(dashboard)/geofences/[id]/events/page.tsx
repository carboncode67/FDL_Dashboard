import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import EventsClient from "./events-client";

export default async function GeofenceEventsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const geofenceId = parseInt(id);

  const [geofence, events] = await Promise.all([
    prisma.geofence.findUnique({ where: { id: geofenceId } }),
    prisma.geofenceEvent.findMany({
      where: { geofence_id: geofenceId },
      include: {
        Contact: { select: { name: true } },
        User: { select: { name: true, email: true } },
      },
      orderBy: { received_at: "desc" },
    }),
  ]);

  if (!geofence) notFound();

  return (
    <EventsClient
      geofence={{ id: geofence.id, title: geofence.title }}
      events={events.map((e) => ({
        id: e.id,
        recipient: e.Contact?.name ?? e.User?.name ?? e.User?.email ?? "Unknown",
        lat: e.lat,
        lng: e.lng,
        occurred_at: e.occurred_at.toISOString(),
        received_at: e.received_at.toISOString(),
      }))}
    />
  );
}
