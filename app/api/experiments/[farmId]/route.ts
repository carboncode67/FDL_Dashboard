import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const INCLUDE = {
  ExperimentTests:        { include: { Test:      { select: { id: true, Test_Name: true } } } },
  ExperimentDroneFlights: { include: { Drone:     { select: { id: true, Name: true } } } },
  ExperimentTreatments:   { include: { Treatment: { select: { id: true, Treatment_Name: true } } } },
  ExperimentFields:       { select: { field_id: true } },
  ExperimentTreatmentValues: { orderBy: [{ treatment_id: "asc" as const }, { field_def_id: "asc" as const }, { row_index: "asc" as const }] },
};

export async function GET(_: Request, { params }: { params: Promise<{ farmId: string }> }) {
  const { farmId } = await params;
  const experiments = await prisma.farmExperiment.findMany({
    where: { farm_id: parseInt(farmId) },
    include: INCLUDE,
    orderBy: { id: "asc" },
  });
  return NextResponse.json(experiments);
}

export async function POST(req: Request, { params }: { params: Promise<{ farmId: string }> }) {
  const { farmId } = await params;
  const farmIdInt = parseInt(farmId);
  const body = await req.json();

  const {
    experiment_name, start_date, end_date, project_id, hypothesis, experiment_desc,
    measurements, criteria, lab_description,
    tests = [], drones = [], treatments = [], field_ids = [], treatmentValues = [],
  } = body;

  const treatmentCreateData = (treatments as { treatment_id: number; is_continuous?: boolean; rate?: number | null; rate_unit?: string | null }[])
    .map((t) => ({
      treatment_id:  t.treatment_id,
      is_continuous: t.is_continuous ?? true,
      rate:          t.rate ?? null,
      rate_unit:     t.rate_unit || null,
    }));

  const fieldCreateData = (field_ids as number[]).map((fid) => ({ field_id: fid }));

  const experiment = await prisma.farmExperiment.create({
    data: {
      farm_id: farmIdInt,
      project_id: project_id ? Number(project_id) : null,
      experiment_name: experiment_name || null,
      start_date: start_date ? new Date(start_date) : null,
      end_date: end_date ? new Date(end_date) : null,
      hypothesis: hypothesis || null,
      experiment_desc: experiment_desc || null,
      measurements: measurements || null,
      criteria: criteria || null,
      lab_description: lab_description || null,
      ExperimentTests: {
        create: tests.map((t: { test_id: number; n_samples?: number | null; expected_date?: string | null; status?: string | null }) => ({
          test_id:       t.test_id,
          n_samples:     t.n_samples ?? null,
          expected_date: t.expected_date ? new Date(t.expected_date) : null,
          status:        t.status ?? null,
        })),
      },
      ExperimentDroneFlights: {
        create: drones.map((d: { drone_id: number; n_flights?: number | null; expected_date?: string | null; status?: string | null }) => ({
          drone_id:      d.drone_id,
          n_flights:     d.n_flights ?? null,
          expected_date: d.expected_date ? new Date(d.expected_date) : null,
          status:        d.status ?? null,
        })),
      },
      ExperimentTreatments: { create: treatmentCreateData },
      ExperimentFields:     { create: fieldCreateData },
    },
    include: INCLUDE,
  });

  if (treatmentValues.length > 0) {
    await prisma.experimentTreatmentValue.createMany({
      data: (treatmentValues as { treatment_id: number; field_def_id: number; row_index: number; value: string }[])
        .map((v) => ({
          experiment_id: experiment.id,
          treatment_id:  v.treatment_id,
          field_def_id:  v.field_def_id,
          row_index:     v.row_index,
          value:         v.value || null,
        })),
    });
  }

  return NextResponse.json(experiment, { status: 201 });
}
