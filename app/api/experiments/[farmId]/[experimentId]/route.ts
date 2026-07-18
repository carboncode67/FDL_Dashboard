import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getEditMode } from "@/lib/edit-mode";
import { canDelete, type Role } from "@/lib/roles";

const INCLUDE = {
  ExperimentTests:        { include: { Test:      { select: { id: true, Test_Name: true } } } },
  ExperimentDroneFlights: { include: { Drone:     { select: { id: true, Name: true } } } },
  ExperimentTreatments:   { include: { Treatment: { select: { id: true, Treatment_Name: true } } } },
  ExperimentFields:       { select: { field_id: true } },
};

type Params = { params: Promise<{ farmId: string; experimentId: string }> };

export async function GET(_: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { experimentId } = await params;
  const experiment = await prisma.farmExperiment.findUniqueOrThrow({
    where: { id: parseInt(experimentId) },
    include: INCLUDE,
  });
  return NextResponse.json(experiment);
}

export async function PUT(req: Request, { params }: Params) {
  const { experimentId } = await params;
  const experimentIdInt = parseInt(experimentId);
  const body = await req.json();

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

  // Capture existing assignments before deleting, so we can detect newly added ones
  const existing = await prisma.farmExperiment.findUnique({
    where: { id: experimentIdInt },
    select: {
      ExperimentTests:        { select: { id: true, test_id: true } },
      ExperimentDroneFlights: { select: { id: true, drone_id: true } },
    },
  });
  const oldTestIds  = new Set((existing?.ExperimentTests  ?? []).map((r) => r.test_id));
  const oldDroneIds = new Set((existing?.ExperimentDroneFlights ?? []).map((r) => r.drone_id));

  // Experiment_Tests and Experiment_Drone_Flights have cascading children
  // (Test_Data_Rows, Drone_Flight_Records), so they must be updated in place —
  // delete+recreate would wipe those children on every save.
  type TestInput  = { test_id: number; n_samples?: number | null; expected_date?: string | null; status?: string | null };
  type DroneInput = { drone_id: number; n_flights?: number | null; expected_date?: string | null; status?: string | null };

  const testPool = new Map<number, number[]>();
  for (const r of existing?.ExperimentTests ?? []) {
    testPool.set(r.test_id, [...(testPool.get(r.test_id) ?? []), r.id]);
  }
  const dronePool = new Map<number, number[]>();
  for (const r of existing?.ExperimentDroneFlights ?? []) {
    dronePool.set(r.drone_id, [...(dronePool.get(r.drone_id) ?? []), r.id]);
  }

  const keepTestIds: number[] = [];
  const testOps = (tests as TestInput[]).map((t) => {
    const data = {
      n_samples:     t.n_samples ?? null,
      expected_date: t.expected_date ? new Date(t.expected_date) : null,
      status:        t.status ?? null,
    };
    const reuseId = testPool.get(t.test_id)?.shift();
    if (reuseId !== undefined) {
      keepTestIds.push(reuseId);
      return prisma.experimentTest.update({ where: { id: reuseId }, data });
    }
    return prisma.experimentTest.create({
      data: { experiment_id: experimentIdInt, test_id: t.test_id, ...data },
    });
  });

  const keepDroneIds: number[] = [];
  const droneOps = (drones as DroneInput[]).map((d) => {
    const data = {
      n_flights:     d.n_flights ?? null,
      expected_date: d.expected_date ? new Date(d.expected_date) : null,
      status:        d.status ?? null,
    };
    const reuseId = dronePool.get(d.drone_id)?.shift();
    if (reuseId !== undefined) {
      keepDroneIds.push(reuseId);
      return prisma.experimentDroneFlight.update({ where: { id: reuseId }, data });
    }
    return prisma.experimentDroneFlight.create({
      data: { experiment_id: experimentIdInt, drone_id: d.drone_id, ...data },
    });
  });

  await prisma.$transaction([
    prisma.experimentTreatmentValue.deleteMany({ where: { experiment_id: experimentIdInt } }),
    prisma.experimentTest.deleteMany({ where: { experiment_id: experimentIdInt, id: { notIn: keepTestIds } } }),
    prisma.experimentDroneFlight.deleteMany({ where: { experiment_id: experimentIdInt, id: { notIn: keepDroneIds } } }),
    ...testOps,
    ...droneOps,
    prisma.experimentTreatment.deleteMany({ where: { experiment_id: experimentIdInt } }),
    prisma.experimentField.deleteMany({ where: { experiment_id: experimentIdInt } }),
  ]);

  const experiment = await prisma.farmExperiment.update({
    where: { id: experimentIdInt },
    data: {
      project_id: project_id !== undefined ? (project_id ? Number(project_id) : null) : undefined,
      experiment_name: experiment_name || null,
      start_date: start_date ? new Date(start_date) : null,
      end_date: end_date !== undefined ? (end_date ? new Date(end_date) : null) : undefined,
      hypothesis: hypothesis || null,
      experiment_desc: experiment_desc || null,
      measurements: measurements || null,
      criteria: criteria || null,
      lab_description: lab_description || null,
      ExperimentTreatments: { create: treatmentCreateData },
      ExperimentFields:     { create: fieldCreateData },
    },
    include: INCLUDE,
  });

  if (treatmentValues.length > 0) {
    await prisma.experimentTreatmentValue.createMany({
      data: (treatmentValues as { treatment_id: number; field_def_id: number; row_index: number; value: string }[])
        .map((v) => ({
          experiment_id: experimentIdInt,
          treatment_id:  v.treatment_id,
          field_def_id:  v.field_def_id,
          row_index:     v.row_index,
          value:         v.value || null,
        })),
    });
  }

  // Auto-create tasks from templates for newly added tests/drones
  type RowWithOverrides = { test_id?: number; drone_id?: number; taskOverrides?: { template_id: number; due_date: string | null; user_ids: string[] }[] };
  const newTestIds  = (tests  as RowWithOverrides[]).map((t) => t.test_id!).filter((id) => !oldTestIds.has(id));
  const newDroneIds = (drones as RowWithOverrides[]).map((d) => d.drone_id!).filter((id) => !oldDroneIds.has(id));

  if (newTestIds.length > 0 || newDroneIds.length > 0) {
    const [testTemplates, droneTemplates] = await Promise.all([
      newTestIds.length  > 0 ? prisma.taskTemplate.findMany({ where: { test_id:  { in: newTestIds  } } }) : Promise.resolve([]),
      newDroneIds.length > 0 ? prisma.taskTemplate.findMany({ where: { drone_id: { in: newDroneIds } } }) : Promise.resolve([]),
    ]);
    const allTemplates = [...testTemplates, ...droneTemplates];

    if (allTemplates.length > 0) {
      // Build a map of template_id → override data from the request body
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
            experiment_id:  experimentIdInt,
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

  return NextResponse.json(experiment);
}

export async function DELETE(_: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const editMode = await getEditMode();
  if (!canDelete(session.user.role as Role, editMode)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { experimentId } = await params;
  await prisma.farmExperiment.delete({ where: { id: parseInt(experimentId) } });
  return NextResponse.json({ success: true });
}
