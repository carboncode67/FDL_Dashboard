import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";

const SELECT = {
  id: true,
  experiment_name: true,
  start_date: true,
  hypothesis: true,
  experiment_desc: true,
  measurements: true,
  criteria: true,
  lab_description: true,
  project_id: true,
};

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const farmId = parseInt(id);
  if (isNaN(farmId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const experiments = await prisma.farmExperiment.findMany({
    where: { farm_id: farmId },
    select: SELECT,
    orderBy: { id: "asc" },
  });

  return NextResponse.json(experiments);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const farmId = parseInt(id);
  if (isNaN(farmId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const {
    experiment_name, start_date, hypothesis, experiment_desc,
    measurements, criteria, lab_description, project_id,
  } = body;

  const experiment = await prisma.farmExperiment.create({
    data: {
      farm_id: farmId,
      experiment_name: experiment_name ?? null,
      start_date: start_date ? new Date(start_date) : undefined,
      hypothesis: hypothesis ?? null,
      experiment_desc: experiment_desc ?? null,
      measurements: measurements ?? null,
      criteria: criteria ?? null,
      lab_description: lab_description ?? null,
      project_id: project_id ?? null,
    },
    select: SELECT,
  });

  return NextResponse.json(experiment, { status: 201 });
}
