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
      ExperimentTests:        { select: { test_id: true } },
      ExperimentDroneFlights: { select: { drone_id: true } },
    },
  });
  const oldTestIds  = new Set((existing?.ExperimentTests  ?? []).map((r) => r.test_id));
  const oldDroneIds = new Set((existing?.ExperimentDroneFlights ?? []).map((r) => r.drone_id));

  await prisma.$transaction([
    prisma.experimentTreatmentValue.deleteMany({ where: { experiment_id: experimentIdInt } }),
    prisma.experimentTest.deleteMany({ where: { experiment_id: experimentIdInt } }),
    prisma.experimentDroneFlight.deleteMany({ where: { experiment_id: experimentIdInt } }),
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
          experiment_id: experimentIdInt,
          treatment_id:  v.treatment_id,
          field_def_id:  v.field_def_id,
          row_index:     v.row_index,
          value:         v.value || null,
        })),
    });
  }

  // Auto-create tasks from templates for newly added tests/drones
  const newTestIds  = (tests  as { test_id: number }[]).map((t) => t.test_id).filter((id) => !oldTestIds.has(id));
  const newDroneIds = (drones as { drone_id: number }[]).map((d) => d.drone_id).filter((id) => !oldDroneIds.has(id));

  if (newTestIds.length > 0 || newDroneIds.length > 0) {
    const [testTemplates, droneTemplates] = await Promise.all([
      newTestIds.length  > 0 ? prisma.taskTemplate.findMany({ where: { test_id:  { in: newTestIds  } } }) : Promise.resolve([]),
      newDroneIds.length > 0 ? prisma.taskTemplate.findMany({ where: { drone_id: { in: newDroneIds } } }) : Promise.resolve([]),
    ]);
    const allTemplates = [...testTemplates, ...droneTemplates];
    if (allTemplates.length > 0) {
      await prisma.task.createMany({
        data: allTemplates.map((t) => ({
          experiment_id:  experimentIdInt,
          description:    t.description,
          classification: t.classification,
          priority:       t.priority,
          status:         "not started",
        })),
      });
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
