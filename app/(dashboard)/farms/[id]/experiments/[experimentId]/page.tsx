import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEditMode } from "@/lib/edit-mode";
import { canDelete as checkCanDelete, type Role } from "@/lib/roles";
import ExperimentFormClient from "../experiment-form-client";

export default async function EditExperimentPage({
  params,
}: {
  params: Promise<{ id: string; experimentId: string }>;
}) {
  const { id, experimentId } = await params;
  const farmId = parseInt(id);
  const expId  = parseInt(experimentId);

  const [session, editMode, farm, farmExperiment, allTests, allDrones, allTreatments, allProjects, farmFields, farmPhotos, farmNotes, farmLabUps, existingValues, allUsers, experimentTasks, taskTemplates] = await Promise.all([
    auth(),
    getEditMode(),
    prisma.farm.findUnique({ where: { id: farmId }, select: { id: true, Farm_Name: true } }),
    prisma.farmExperiment.findUnique({
      where: { id: expId },
      include: {
        ExperimentTests:        true,
        ExperimentDroneFlights: { include: { DroneFlightRecords: { orderBy: { flight_date: "asc" } } } },
        ExperimentTreatments:   true,
        ExperimentFields:       true,
      },
    }),
    prisma.test.findMany({ select: { id: true, Test_Name: true, TaskTemplates: { select: { id: true, description: true, classification: true, priority: true } } }, orderBy: { Test_Name: "asc" } }),
    prisma.drone.findMany({ select: { id: true, Name: true, TaskTemplates: { select: { id: true, description: true, classification: true, priority: true } } }, orderBy: { Name: "asc" } }),
    prisma.treatment.findMany({
      select: {
        id:               true,
        Treatment_Name:   true,
        allow_extra_rows: true,
        TreatmentFieldDefinitions: { orderBy: { col_index: "asc" } },
      },
      orderBy: { Treatment_Name: "asc" },
    }),
    prisma.project.findMany({ select: { id: true, Project_Name: true }, orderBy: { Project_Name: "asc" } }),
    prisma.field.findMany({
      where: { Farms_id: farmId },
      select: { id: true, Name: true, geometry: true },
      orderBy: { Name: "asc" },
    }),
    prisma.photo.findMany({
      where: { farm_id: farmId, latitude: { not: null }, longitude: { not: null } },
      select: { id: true, latitude: true, longitude: true },
    }),
    prisma.note.findMany({
      where: { farm_id: farmId, latitude: { not: null }, longitude: { not: null } },
      select: { id: true, latitude: true, longitude: true },
    }),
    prisma.labMemberUpload.findMany({
      where: { farm_id: farmId, latitude: { not: null }, longitude: { not: null } },
      select: { id: true, latitude: true, longitude: true },
    }),
    prisma.experimentTreatmentValue.findMany({
      where: { experiment_id: expId },
      orderBy: [{ treatment_id: "asc" }, { field_def_id: "asc" }, { row_index: "asc" }],
    }),
    prisma.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    prisma.task.findMany({
      where: { experiment_id: expId },
      include: { Assignees: { include: { User: { select: { id: true, name: true, email: true } } } } },
      orderBy: { created_at: "desc" },
    }),
    prisma.taskTemplate.findMany({
      where: { test_id: null, drone_id: null },
      select: { id: true, description: true, classification: true, priority: true },
      orderBy: { description: "asc" },
    }),
  ]);

  if (!farm || !farmExperiment) notFound();

  const userCanDelete = checkCanDelete(session?.user?.role as Role, editMode);

  const farmUploadPins = [
    ...farmPhotos.map((p) => ({ id: p.id, lat: p.latitude!, lng: p.longitude!, type: "photo" as const })),
    ...farmNotes.map((n)  => ({ id: n.id, lat: n.latitude!, lng: n.longitude!, type: "note"  as const })),
    ...farmLabUps.map((l) => ({ id: l.id, lat: l.latitude!, lng: l.longitude!, type: "lab"   as const })),
  ];

  return (
    <ExperimentFormClient
      farmId={farm.id}
      farmName={farm.Farm_Name}
      experimentId={expId}
      allProjects={allProjects}
      experiment={{
        experiment_name: farmExperiment.experiment_name,
        start_date:      farmExperiment.start_date?.toISOString().slice(0, 10) ?? null,
        end_date:        farmExperiment.end_date?.toISOString().slice(0, 10) ?? null,
        project_id:      farmExperiment.project_id ?? null,
        hypothesis:      farmExperiment.hypothesis,
        experiment_desc: farmExperiment.experiment_desc,
        measurements:    farmExperiment.measurements,
        criteria:        farmExperiment.criteria,
        lab_description: farmExperiment.lab_description,
        tests: farmExperiment.ExperimentTests.map((t) => ({
          test_id:       t.test_id,
          n_samples:     t.n_samples,
          expected_date: t.expected_date?.toISOString().slice(0, 10) ?? null,
          status:        t.status ?? null,
        })),
        drones: farmExperiment.ExperimentDroneFlights.map((d) => ({
          id:            d.id,
          drone_id:      d.drone_id,
          n_flights:     d.n_flights,
          expected_date: d.expected_date?.toISOString().slice(0, 10) ?? null,
          status:        d.status ?? null,
        })),
        droneFlightRecordsMap: Object.fromEntries(
          farmExperiment.ExperimentDroneFlights.map((d) => [
            d.id,
            d.DroneFlightRecords.map((r) => ({
              id:                         r.id,
              experiment_drone_flight_id: r.experiment_drone_flight_id,
              flight_date:                r.flight_date?.toISOString().slice(0, 10) ?? null,
              pilot:                      r.pilot,
              flight_status:              r.flight_status,
              total_acres:                r.total_acres ? Number(r.total_acres) : null,
              total_images:               r.total_images,
              needs_3d:                   r.needs_3d,
              needs_ortho:                r.needs_ortho,
              processed:                  r.processed,
              data_storage_path:          r.data_storage_path,
              tile_coverage_pct:          r.tile_coverage_pct ? Number(r.tile_coverage_pct) : null,
              tile_size_m:                r.tile_size_m ? Number(r.tile_size_m) : null,
              notes:                      r.notes,
            })),
          ])
        ),
        treatments: farmExperiment.ExperimentTreatments.map((t) => ({
          treatment_id:             t.treatment_id,
          is_continuous:            t.is_continuous ?? true,
          has_control_treatment:    t.has_control_treatment,
          control_treatment_type:   t.control_treatment_type ?? null,
          control_treatment_number: t.control_treatment_number ?? null,
        })),
        field_ids: farmExperiment.ExperimentFields.map((ef) => ef.field_id),
        treatmentValues: existingValues.map((v) => ({
          treatment_id: v.treatment_id,
          field_def_id: v.field_def_id,
          row_index:    v.row_index,
          value:        v.value ?? "",
        })),
      }}
      allTests={allTests}
      allDrones={allDrones}
      allTreatments={allTreatments}
      farmFields={farmFields}
      farmUploadPins={farmUploadPins}
      allUsers={allUsers}
      canDelete={userCanDelete}
      initialTasks={experimentTasks.map((t) => ({
        id:             t.id,
        description:    t.description,
        classification: t.classification,
        status:         t.status,
        priority:       t.priority,
        due_date:       t.due_date?.toISOString().slice(0, 10) ?? null,
        assignees:      t.Assignees.map((a) => ({ id: a.User.id, name: a.User.name, email: a.User.email })),
        created_at:     t.created_at.toISOString(),
      }))}
      taskTemplates={taskTemplates}
    />
  );
}
