import { prisma } from "@/lib/prisma";
import { GeofencesClient } from "./geofences-client";

export default async function GeofencesPage() {
  const geofences = await prisma.geofence.findMany({
    include: { _count: { select: { Assignments: true, Events: true } } },
    orderBy: { created_at: "desc" },
  });

  const data = geofences.map((g) => ({
    id: g.id,
    title: g.title,
    is_active: g.is_active,
    assignment_count: g._count.Assignments,
    event_count: g._count.Events,
  }));

  return <GeofencesClient data={data} />;
}
