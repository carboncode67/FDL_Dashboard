import { prisma } from "@/lib/prisma";
import { processingConfigured, triggerBasemapTiling } from "@/lib/processing";
import { farmCentroidFor } from "@/lib/pipeline-farm";
import { presignProcessorDownload } from "@/lib/s3";

// Where PipelineProcessor fetches a basemap's source raster from. A 'local'
// source (busboy upload or intake share) goes through the ordinary file route
// with the processor's bearer token, as before. An 's3' source (presigned
// multipart upload, migration 093) gets a presigned GET signed for the host
// Datamachine reaches Garage on, so the bytes stay on the campus LAN rather
// than hairpinning out through the Pangolin droplet. Signed fresh on each
// call: retile always gets a new 24 h URL.
export async function basemapSourceDownloadUrl(b: {
  source_storage: string;
  source_s3_key: string | null;
  source_filename: string;
}): Promise<string> {
  if (b.source_storage === "s3") {
    if (!b.source_s3_key) throw new Error("S3 basemap has no source_s3_key");
    return presignProcessorDownload(b.source_s3_key);
  }
  const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
  return `${baseUrl}/api/files/basemap-sources/${b.source_filename}`;
}

// Fire-and-forget tiling kick-off for a freshly created Basemaps row: the same
// pending -> tiling (accepted) / failed (unreachable) handling as
// receiveBasemapUpload() in lib/farm-uploads.ts. A no-op that leaves the row
// "pending" when no processor is configured.
export function startBasemapTiling(basemap: {
  id: number;
  farm_id: number;
  source_storage: string;
  source_s3_key: string | null;
  source_filename: string;
  crs_override_epsg: number | null;
}): void {
  if (!processingConfigured) return;
  const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
  (async () => {
    await triggerBasemapTiling({
      basemap_id: basemap.id,
      download_url: await basemapSourceDownloadUrl(basemap),
      callback_url: `${baseUrl}/api/basemaps/webhook`,
      farm_centroid: await farmCentroidFor(basemap.farm_id),
      crs_override_epsg: basemap.crs_override_epsg,
    });
    // Guarded: a fast job's webhook may already have set ready/failed.
    await prisma.basemap.updateMany({ where: { id: basemap.id, tiling_status: "pending" }, data: { tiling_status: "tiling" } });
  })().catch(async (err) => {
    console.error("[basemap tiling] trigger failed", err);
    await prisma.basemap
      .update({ where: { id: basemap.id }, data: { tiling_status: "failed", error_message: "Failed to reach the processing machine" } })
      .catch(() => {});
  });
}
