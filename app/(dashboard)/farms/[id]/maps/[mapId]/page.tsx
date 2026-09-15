import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { canCreate, type Role } from "@/lib/roles";
import { getEffectiveScope, scopeIncludesFarm } from "@/lib/get-user-filters";
import SamplingMapEditorWrapper from "@/components/sampling-map-editor-wrapper";
import type { ImportableBoundary } from "@/components/import-boundary-dialog";
import { pipelineOutputToMapRaster, basemapToMapRaster } from "@/lib/map-rasters";
import { ASSIGNMENT_INCLUDE } from "@/lib/sampling-maps";
import { runWithTenant } from "@/lib/lab-db";

export default async function SamplingMapDetailRoute({
  params,
}: {
  params: Promise<{ id: string; mapId: string }>;
}) {
  return runWithTenant(async () => {
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
          Basemaps: {
            where: { tiling_status: "ready", crs_status: { not: "unclear" } },
            orderBy: { created_at: "desc" },
          },
        },
      },
    },
  });
  if (!map || map.farm_id !== farmId) notFound();

  const scope = await getEffectiveScope(session?.user?.id ?? null, session?.user?.category);
  if (!scopeIncludesFarm(scope, farmId)) notFound();

  const [assignments, users, forms] = await Promise.all([
    prisma.samplingMapAssignment.findMany({
      where: { sampling_map_id: map.id },
      include: ASSIGNMENT_INCLUDE,
      orderBy: { created_at: "asc" },
    }),
    prisma.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    prisma.form.findMany({
      where: { is_active: true },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
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
  const rasters = [
    ...map.Farm.PipelineOutputRasters.map(pipelineOutputToMapRaster),
    ...map.Farm.Basemaps.map(basemapToMapRaster),
  ];
  // Options for the raster-basemap toolset's picker (item 6.2) — same source
  // list as the checklist above, just id+label instead of a full MapRaster.
  const availableBasemaps = map.Farm.Basemaps.map((b) => ({ id: b.id, label: b.original_filename }));
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
      forms={forms}
      formId={map.form_id}
      proximityRadiusM={map.proximity_radius_m}
      availableBasemaps={availableBasemaps}
      basemapId={map.basemap_id}
      basemapBufferM={map.basemap_buffer_m}
      basemapMaxZoom={map.basemap_max_zoom}
    />
  );
  });
}
