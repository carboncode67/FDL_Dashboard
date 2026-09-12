import { prisma } from "@/lib/prisma";
import { SamplingMapsListClient } from "./sampling-maps-list-client";
import { runWithTenant } from "@/lib/lab-db";

export default async function SamplingMapsPage() {
  return runWithTenant(async () => {
  const [maps, farms, experiments] = await Promise.all([
    prisma.samplingMap.findMany({
      orderBy: { updated_at: "desc" },
      include: {
        Farm: { select: { id: true, Farm_Name: true } },
        Experiment: { select: { experiment_name: true } },
        _count: { select: { Polygons: true, Points: true } },
      },
    }),
    prisma.farm.findMany({
      select: { id: true, Farm_Name: true },
      orderBy: { Farm_Name: "asc" },
    }),
    prisma.farmExperiment.findMany({
      select: { id: true, farm_id: true, experiment_name: true },
      orderBy: { experiment_name: "asc" },
    }),
  ]);

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

  return (
    <SamplingMapsListClient
      data={data}
      farms={farms.map((f) => ({ id: f.id, name: f.Farm_Name ?? `Farm #${f.id}` }))}
      experiments={experiments
        .filter((e): e is typeof e & { farm_id: number } => e.farm_id != null)
        .map((e) => ({
          id: e.id,
          farmId: e.farm_id,
          name: e.experiment_name ?? `Experiment #${e.id}`,
        }))}
    />
  );
  });
}
