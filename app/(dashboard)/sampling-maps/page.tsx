import { prisma } from "@/lib/prisma";
import { SamplingMapsListClient } from "./sampling-maps-list-client";

export default async function SamplingMapsPage() {
  const maps = await prisma.samplingMap.findMany({
    orderBy: { updated_at: "desc" },
    include: {
      Farm: { select: { id: true, Farm_Name: true } },
      Experiment: { select: { experiment_name: true } },
      _count: { select: { Polygons: true, Points: true } },
    },
  });

  const data = maps.map((m) => ({
    id: m.id,
    farmId: m.farm_id,
    name: m.name,
    Farm_Name: m.Farm.Farm_Name ?? `Farm #${m.farm_id}`,
    Experiment_Name: m.Experiment?.experiment_name ?? null,
    polygonCount: m._count.Polygons,
    pointCount: m._count.Points,
    updated_at: m.updated_at.toISOString(),
  }));

  return <SamplingMapsListClient data={data} />;
}
