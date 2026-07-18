import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";

const INCLUDE = {
  ExperimentTests: {
    include: {
      Test: {
        select: {
          id: true,
          Test_Name: true,
          TestFieldDefinitions: {
            orderBy: { col_index: "asc" as const },
            select: { col_index: true, field_type: true, label: true },
          },
          Documents: {
            select: { id: true, filename: true, original_name: true, file_type: true, file_size: true },
          },
        },
      },
    },
  },
  ExperimentDroneFlights: { include: { Drone: { select: { id: true, Name: true } } } },
  ExperimentTreatments: { include: { Treatment: { select: { id: true, Treatment_Name: true } } } },
};

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const farmId = parseInt(id);
  if (isNaN(farmId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const experiment = await prisma.farmExperiment.findFirst({
    where: { farm_id: farmId },
    include: INCLUDE,
  });

  return NextResponse.json(experiment ?? null);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const farmId = parseInt(id);
  if (isNaN(farmId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json();
  const {
    experiment_name, start_date, hypothesis, experiment_desc,
    measurements, criteria, lab_description,
  } = body;

  const data = {
    experiment_name: experiment_name ?? null,
    start_date: start_date ? new Date(start_date) : undefined,
    hypothesis: hypothesis ?? null,
    experiment_desc: experiment_desc ?? null,
    measurements: measurements ?? null,
    criteria: criteria ?? null,
    lab_description: lab_description ?? null,
  };

  const existing = await prisma.farmExperiment.findFirst({ where: { farm_id: farmId } });
  const experiment = existing
    ? await prisma.farmExperiment.update({ where: { id: existing.id }, data, include: INCLUDE })
    : await prisma.farmExperiment.create({ data: { farm_id: farmId, ...data }, include: INCLUDE });

  return NextResponse.json(experiment);
}
