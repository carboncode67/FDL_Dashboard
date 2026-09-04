import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { canCreate, type Role } from "@/lib/roles";
import { getEffectiveScope, scopeIncludesFarm } from "@/lib/get-user-filters";
import SamplingMapEditorWrapper from "@/components/sampling-map-editor-wrapper";
import type { ImportableBoundary } from "@/components/import-boundary-dialog";
import type { MapRaster } from "@/components/map-raster-layers";
import { ASSIGNMENT_INCLUDE } from "@/lib/sampling-maps";

export default async function SamplingMapDetailRoute({
  params,
}: {
  params: Promise<{ id: string; mapId: string }>;
}) {
  const { id, mapId } = await params;
  const farmId = parseInt(id);

  const session = await auth();
  const role = (session?.user?.role ?? "viewer") as Role;
  if (!canCreate(role)) notFound();

  const map = await prisma.samplingMap.findUnique({
    where: { id: parseInt(mapId) },
    include: {
      Polygons: true,
      Points: true,
      Experiment: {
        select: {
          ExperimentTests: { include: { Test: { select: { id: true, Test_Name: true } } } },
        },
      },
      Farm: {
        include: {
          Fields: { where: { geometry: { not: null } } },
          ExperimentZones: { where: { geometry: { not: null } } },
          PipelineOutputRasters: {
            where: { crs_status: { not: "unclear" } },
            include: { Run: { select: { Pipeline: { select: { name: true } } } } },
          },
        },
      },
    },
  });
  if (!map || map.farm_id !== farmId) notFound();

  const scope = await getEffectiveScope(session?.user?.id ?? null, session?.user?.category);
  if (!scopeIncludesFarm(scope, farmId)) notFound();

  const [assignments, users] = await Promise.all([
    prisma.samplingMapAssignment.findMany({
      where: { sampling_map_id: map.id },
      include: ASSIGNMENT_INCLUDE,
      orderBy: { created_at: "asc" },
    }),
    prisma.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ]);

  const importableFields: ImportableBoundary[] = map.Farm.Fields.map((f) => ({
    id: f.id,
    name: f.Name ?? `Field #${f.id}`,
    kind: "field",
  }));
  const importableZones: ImportableBoundary[] = map.Farm.ExperimentZones.map((z) => ({
    id: z.id,
    name: z.Zone_Label ?? `Zone #${z.id}`,
    kind: "zone",
  }));
  const rasters: MapRaster[] = map.Farm.PipelineOutputRasters.map((r) => ({
    id: r.id,
    url: `/api/files/pipeline-outputs/${r.filename}`,
    label: `${r.Run.Pipeline.name} — ${r.original_filename}`,
    kind: r.kind === "vector" ? "vector" : "raster",
    crsStatus: r.crs_status === "ok" ? "ok" : null,
  }));
  const experimentTests = (map.Experiment?.ExperimentTests ?? []).map((et) => ({
    id: et.id,
    testName: et.Test.Test_Name ?? `Test #${et.Test.id}`,
  }));

  return (
    <SamplingMapEditorWrapper
      samplingMapId={map.id}
      farmId={farmId}
      farmName={map.Farm.Farm_Name ?? `Farm #${farmId}`}
      mapName={map.name}
      farmLat={map.Farm.latitude ?? undefined}
      farmLng={map.Farm.longitude ?? undefined}
      initialPolygons={map.Polygons.map((p) => ({
        id: p.id,
        label: p.label,
        purpose: p.purpose,
        geometry: p.geometry,
        source: p.source,
      }))}
      initialPoints={map.Points.map((p) => ({
        id: p.id,
        label: p.label,
        geometry: p.geometry,
        polygon_id: p.polygon_id,
        experiment_test_id: p.experiment_test_id,
        placement_method: p.placement_method,
      }))}
      rasters={rasters}
      importableFields={importableFields}
      importableZones={importableZones}
      experimentTests={experimentTests}
      hasExperiment={map.experiment_id != null}
      assignments={assignments.map((a) => ({
        id: a.id,
        user_id: a.user_id,
        user_label: a.User.name ?? a.User.email,
      }))}
      users={users}
    />
  );
}
