import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const INCLUDE = {
  ExperimentTests:        { include: { Test:      { select: { id: true, Test_Name: true } } } },
  ExperimentDroneFlights: { include: { Drone:     { select: { id: true, Name: true } } } },
  ExperimentTreatments:   { include: { Treatment: { select: { id: true, Treatment_Name: true } } } },
  ExperimentFields:       { select: { field_id: true } },
};

export async function GET(_: Request, { params }: { params: Promise<{ farmId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { farmId } = await params;
  const experiments = await prisma.farmExperiment.findMany({
    where: { farm_id: parseInt(farmId) },
    include: INCLUDE,
    orderBy: { id: "asc" },
  });
  return NextResponse.json(experiments);
}

export async function POST(req: Request, { params }: { params: Promise<{ farmId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { farmId } = await params;
  const farmIdInt = parseInt(farmId);
  const body = await req.json();

  type RowWithOverrides = { test_id?: number; drone_id?: number; taskOverrides?: { template_id: number; due_date: string | null; user_ids: string[] }[] };

  const {
    experiment_name, start_date, end_date, project_id, hypothesis, experiment_desc,
    measurements, criteria, lab_description,
    tests = [], drones = [], treatments = [], field_ids = [], treatmentValues = [],
  } = body;

  const treatmentCreateData = (treatments as { treatment_id: number; is_continuous?: boolean; has_control_treatment?: boolean; control_treatment_type?: string | null; control_treatment_number?: number | null }[])
    .map((t) => ({
      treatment_id:             t.treatment_id,
      is_continuous:            t.is_continuous ?? true,
      has_control_treatment:    t.has_control_treatment ?? false,
      control_treatment_type:   t.control_treatment_type || null,
      control_treatment_number: t.control_treatment_number ?? null,
    }));

  const fieldCreateData = (field_ids as number[]).map((fid) => ({ field_id: fid }));

  const experiment = await prisma.farmExperiment.create({
    data: {
      farm_id: farmIdInt,
      project_id: project_id ? Number(project_id) : null,
      created_by_id: session.user.id,
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

  // Create tasks from templates for tests/drones added to this new experiment
  const allTestIds  = (tests  as RowWithOverrides[]).map((t) => t.test_id!).filter(Boolean);
  const allDroneIds = (drones as RowWithOverrides[]).map((d) => d.drone_id!).filter(Boolean);

  if (allTestIds.length > 0 || allDroneIds.length > 0) {
    const [testTemplates, droneTemplates] = await Promise.all([
      allTestIds.length  > 0 ? prisma.taskTemplate.findMany({ where: { test_id:  { in: allTestIds  } } }) : Promise.resolve([]),
      allDroneIds.length > 0 ? prisma.taskTemplate.findMany({ where: { drone_id: { in: allDroneIds } } }) : Promise.resolve([]),
    ]);
    const allTemplates = [...testTemplates, ...droneTemplates];

    if (allTemplates.length > 0) {
      const overrideMap = new Map<number, { due_date: string | null; user_ids: string[] }>();
      for (const row of [...(tests as RowWithOverrides[]), ...(drones as RowWithOverrides[])]) {
        for (const ovr of (row.taskOverrides ?? [])) {
          overrideMap.set(ovr.template_id, { due_date: ovr.due_date, user_ids: ovr.user_ids ?? [] });
        }
      }

      for (const t of allTemplates) {
        const ovr = overrideMap.get(t.id);
        const task = await prisma.task.create({
          data: {
            experiment_id:  experiment.id,
            description:    t.description,
            classification: t.classification,
            priority:       t.priority,
            status:         "not started",
            due_date:       ovr?.due_date ? new Date(ovr.due_date) : null,
          },
        });
        if (ovr?.user_ids?.length) {
          await prisma.taskAssignee.createMany({
            data: ovr.user_ids.map((uid) => ({ task_id: task.id, user_id: uid })),
          });
        }
      }
    }
  }

  return NextResponse.json(experiment, { status: 201 });
}
