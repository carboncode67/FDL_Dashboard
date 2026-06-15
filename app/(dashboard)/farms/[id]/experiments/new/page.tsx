import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import ExperimentFormClient from "../experiment-form-client";

export default async function NewExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const farmId = parseInt(id);

  const [farm, allTests, allDrones, allTreatments, allProjects, farmFields, farmPhotos, farmNotes, farmLabUps] = await Promise.all([
    prisma.farm.findUnique({ where: { id: farmId }, select: { id: true, Farm_Name: true } }),
    prisma.test.findMany({ select: { id: true, Test_Name: true }, orderBy: { Test_Name: "asc" } }),
    prisma.drone.findMany({ select: { id: true, Name: true }, orderBy: { Name: "asc" } }),
    prisma.treatment.findMany({ select: { id: true, Treatment_Name: true }, orderBy: { Treatment_Name: "asc" } }),
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
  ]);

  if (!farm) notFound();

  const farmUploadPins = [
    ...farmPhotos.map((p) => ({ id: p.id, lat: p.latitude!, lng: p.longitude!, type: "photo" as const })),
    ...farmNotes.map((n)  => ({ id: n.id, lat: n.latitude!, lng: n.longitude!, type: "note"  as const })),
    ...farmLabUps.map((l) => ({ id: l.id, lat: l.latitude!, lng: l.longitude!, type: "lab"   as const })),
  ];

  return (
    <ExperimentFormClient
      farmId={farm.id}
      farmName={farm.Farm_Name}
      experimentId={undefined}
      experiment={null}
      allTests={allTests}
      allDrones={allDrones}
      allTreatments={allTreatments}
      allProjects={allProjects}
      farmFields={farmFields}
      farmUploadPins={farmUploadPins}
    />
  );
}
