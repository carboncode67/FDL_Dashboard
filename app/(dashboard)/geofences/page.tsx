import { prisma } from "@/lib/prisma";
import { GeofencesClient } from "./geofences-client";
import { runWithTenant } from "@/lib/lab-db";

export default async function GeofencesPage() {
  return runWithTenant(async () => {
  const geofences = await prisma.geofence.findMany({
    include: { _count: { select: { Zones: true, Assignments: true, Events: true } } },
    orderBy: { created_at: "desc" },
  });

  const data = geofences.map((g) => ({
    id: g.id,
    title: g.title,
    is_active: g.is_active,
    zone_count: g._count.Zones,
    assignment_count: g._count.Assignments,
    event_count: g._count.Events,
  }));

  return <GeofencesClient data={data} />;
  });
}
