import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import ExperimentFormClient from "../experiment-form-client";

export default async function EditExperimentPage({
  params,
}: {
  params: Promise<{ id: string; experimentId: string }>;
}) {
  const { id, experimentId } = await params;
  const farmId = parseInt(id);
  const expId  = parseInt(experimentId);

  const [farm, farmExperiment, allTests, allDrones, allTreatments, allProjects, farmFields, farmPhotos, farmNotes, farmLabUps, existingValues] = await Promise.all([
    prisma.farm.findUnique({ where: { id: farmId }, select: { id: true, Farm_Name: true } }),
    prisma.farmExperiment.findUnique({
      where: { id: expId },
      include: {
        ExperimentTests:        true,
        ExperimentDroneFlights: true,
        ExperimentTreatments:   true,
        ExperimentFields:       true,
      },
    }),
    prisma.test.findMany({ select: { id: true, Test_Name: true }, orderBy: { Test_Name: "asc" } }),
    prisma.drone.findMany({ select: { id: true, Name: true }, orderBy: { Name: "asc" } }),
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
  ]);

  if (!farm || !farmExperiment) notFound();

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
          drone_id:      d.drone_id,
          n_flights:     d.n_flights,
          expected_date: d.expected_date?.toISOString().slice(0, 10) ?? null,
          status:        d.status ?? null,
        })),
        treatments: farmExperiment.ExperimentTreatments.map((t) => ({
          treatment_id:  t.treatment_id,
          is_continuous: t.is_continuous ?? true,
          rate:          t.rate !== null ? Number(t.rate) : null,
          rate_unit:     t.rate_unit ?? null,
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
    />
  );
}
