import { prisma } from "@/lib/prisma";

// Resolves which Farm a Pipeline_Run should be snapshotted against, at creation time
// (see PipelineRun.farm_id) — trigger_upload_id is a bare, untyped polymorphic
// reference (varies by trigger_upload_table), so there's no single join that covers
// every shape. Six cases in total, matching every place matchAndTriggerPipelines() or
// a manual/rerun trigger can originate from:
//   photos / notes / recordings / locations / lab-member-uploads / documents
//     -> that table's own farm_id column (one hop)
//   test-data-rows (id = an Experiment_Tests.id)
//     -> ExperimentTest.experiment_id -> FarmExperiment.farm_id (two hops)
//   drone-flight target (see resolveFarmForDroneFlight below)
//     -> DroneFlightRecord.experiment_drone_flight_id -> ExperimentDroneFlight.experiment_id
//        -> FarmExperiment.farm_id (three hops)
// Returns null (never throws) when nothing resolves — callers store that as-is; the UI
// shows a null PipelineRun.farm_id as "No Farm Associated" rather than treating it as
// an error, since a manual "Run"/registration test-run legitimately has no farm.
export async function resolveFarmForTrigger(opts: {
  table: string;
  id: number;
}): Promise<number | null> {
  const { table, id } = opts;
  try {
    switch (table) {
      case "photos":
        return (await prisma.photo.findUnique({ where: { id }, select: { farm_id: true } }))?.farm_id ?? null;
      case "notes":
        return (await prisma.note.findUnique({ where: { id }, select: { farm_id: true } }))?.farm_id ?? null;
      case "recordings":
        return (await prisma.recording.findUnique({ where: { id }, select: { farm_id: true } }))?.farm_id ?? null;
      case "locations":
        return (await prisma.location.findUnique({ where: { id }, select: { farm_id: true } }))?.farm_id ?? null;
      case "lab-member-uploads":
        return (await prisma.labMemberUpload.findUnique({ where: { id }, select: { farm_id: true } }))?.farm_id ?? null;
      case "documents":
        return (await prisma.document.findUnique({ where: { id }, select: { farm_id: true } }))?.farm_id ?? null;
      case "test-data-rows": {
        const et = await prisma.experimentTest.findUnique({
          where: { id },
          select: { Experiment: { select: { farm_id: true } } },
        });
        return et?.Experiment?.farm_id ?? null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export async function resolveFarmForDroneFlight(droneFlightRecordId: number): Promise<number | null> {
  try {
    const record = await prisma.droneFlightRecord.findUnique({
      where: { id: droneFlightRecordId },
      select: { ExperimentDroneFlight: { select: { Experiment: { select: { farm_id: true } } } } },
    });
    return record?.ExperimentDroneFlight?.Experiment?.farm_id ?? null;
  } catch {
    return null;
  }
}

// Ground truth location handed to PipelineProcessor's geo_sanity CRS check (see
// TriggerRunPayload.farm_centroid in lib/processing.ts) — never fed into the
// pipeline script itself. Null whenever the farm has no geocoded address yet
// (Farms.latitude/longitude are nullable, set by Nominatim on the farm edit
// form's address blur) — callers should just omit farm_centroid in that case
// rather than send a run with no CRS ground truth to check against.
export async function farmCentroidFor(farmId: number): Promise<{ lat: number; lng: number } | null> {
  try {
    const farm = await prisma.farm.findUnique({
      where: { id: farmId },
      select: { latitude: true, longitude: true },
    });
    if (farm?.latitude == null || farm?.longitude == null) return null;
    return { lat: farm.latitude, lng: farm.longitude };
  } catch {
    return null;
  }
}
