import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const includeContext = {
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
};

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const record = await prisma.droneFlightRecord.findUnique({
    where: { id: parseInt(id) },
    include: includeContext,
  });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(record);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { flight_date, pilot, flight_status, total_acres, total_images, needs_3d, needs_ortho, processed, data_storage_path, tile_coverage_pct, tile_size_m, notes } = body;

  const record = await prisma.droneFlightRecord.update({
    where: { id: parseInt(id) },
    data: {
      flight_date: flight_date !== undefined ? (flight_date ? new Date(flight_date) : null) : undefined,
      pilot: pilot !== undefined ? pilot : undefined,
      flight_status: flight_status !== undefined ? flight_status : undefined,
      total_acres: total_acres !== undefined ? total_acres : undefined,
      total_images: total_images !== undefined ? (total_images != null ? parseInt(total_images) : null) : undefined,
      needs_3d: needs_3d !== undefined ? needs_3d : undefined,
      needs_ortho: needs_ortho !== undefined ? needs_ortho : undefined,
      processed: processed !== undefined ? processed : undefined,
      data_storage_path: data_storage_path !== undefined ? data_storage_path : undefined,
      tile_coverage_pct: tile_coverage_pct !== undefined ? tile_coverage_pct : undefined,
      tile_size_m: tile_size_m !== undefined ? tile_size_m : undefined,
      notes: notes !== undefined ? notes : undefined,
    },
    include: includeContext,
  });

  return NextResponse.json(record);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.droneFlightRecord.delete({ where: { id: parseInt(id) } });
  return new NextResponse(null, { status: 204 });
}
