import { prisma } from "@/lib/prisma";
import { DroneFlightsClient } from "./drone-flights-client";

export default async function DroneFlightsPage() {
  const records = await prisma.droneFlightRecord.findMany({
    include: {
      ExperimentDroneFlight: {
        include: {
          Drone: { select: { id: true, Name: true } },
          Experiment: {
            select: {
              id: true,
              experiment_name: true,
              Farm: { select: { id: true, Farm_Name: true } },
            },
          },
        },
      },
    },
    orderBy: [{ flight_date: "asc" }, { created_at: "desc" }],
  });

  const data = records.map((r) => ({
    id: r.id,
    experiment_drone_flight_id: r.experiment_drone_flight_id,
    drone_name: r.ExperimentDroneFlight.Drone.Name ?? null,
    farm_id: r.ExperimentDroneFlight.Experiment?.Farm?.id ?? null,
    farm_name: r.ExperimentDroneFlight.Experiment?.Farm?.Farm_Name ?? null,
    experiment_id: r.ExperimentDroneFlight.Experiment?.id ?? null,
    experiment_name: r.ExperimentDroneFlight.Experiment?.experiment_name ?? null,
    flight_date: r.flight_date ? r.flight_date.toISOString().slice(0, 10) : null,
    pilot: r.pilot,
    flight_status: r.flight_status,
    total_acres: r.total_acres ? Number(r.total_acres) : null,
    total_images: r.total_images,
    needs_3d: r.needs_3d,
    needs_ortho: r.needs_ortho,
    processed: r.processed,
    data_storage_path: r.data_storage_path,
    tile_coverage_pct: r.tile_coverage_pct ? Number(r.tile_coverage_pct) : null,
    tile_size_m: r.tile_size_m ? Number(r.tile_size_m) : null,
    notes: r.notes,
  }));

  return <DroneFlightsClient data={data} />;
}
