import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const farmId = searchParams.get("farm_id");
  const experimentId = searchParams.get("experiment_id");
  const status = searchParams.get("status");

  const records = await prisma.droneFlightRecord.findMany({
    where: {
      ...(status ? { flight_status: status } : {}),
      ExperimentDroneFlight: {
        ...(experimentId ? { experiment_id: parseInt(experimentId) } : {}),
        ...(farmId
          ? { Experiment: { farm_id: parseInt(farmId) } }
          : {}),
      },
    },
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

  return NextResponse.json(records);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { experiment_drone_flight_id, flight_date, pilot, flight_status, total_acres, total_images, needs_3d, needs_ortho, processed, data_storage_path, tile_coverage_pct, tile_size_m, notes } = body;

  const record = await prisma.droneFlightRecord.create({
    data: {
      experiment_drone_flight_id: parseInt(experiment_drone_flight_id),
      flight_date: flight_date ? new Date(flight_date) : null,
      pilot: pilot ?? null,
      flight_status: flight_status ?? "Scheduled",
      total_acres: total_acres != null ? total_acres : null,
      total_images: total_images != null ? parseInt(total_images) : null,
      needs_3d: needs_3d ?? false,
      needs_ortho: needs_ortho ?? false,
      processed: processed ?? false,
      data_storage_path: data_storage_path ?? null,
      tile_coverage_pct: tile_coverage_pct != null ? tile_coverage_pct : null,
      tile_size_m: tile_size_m != null ? tile_size_m : null,
      notes: notes ?? null,
    },
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
  });

  return NextResponse.json(record, { status: 201 });
}
