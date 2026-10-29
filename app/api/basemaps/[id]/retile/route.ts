import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate } from "@/lib/roles";
import { runWithTenant } from "@/lib/lab-db";
import { processingConfigured, triggerBasemapTiling } from "@/lib/processing";
import { farmCentroidFor } from "@/lib/pipeline-farm";

// Re-sends a basemap that never got tiled (uploaded while PROCESSING_URL was
// unset, or the processor was unreachable) or whose tiling failed — the
// "Retry" link next to it under the farm map. Same trigger as POST
// /api/basemaps. A "ready" one can be re-tiled too (e.g. after a tiler fix);
// it drops off the map until the new tiles land, which overwrite the old ones.
export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreate(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!processingConfigured) {
    return NextResponse.json({ error: "No processing machine is configured (PROCESSING_URL)" }, { status: 503 });
  }

  const { id } = await params;
  const basemap = await prisma.basemap.findUnique({ where: { id: parseInt(id) } });
  if (!basemap) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (basemap.tiling_status === "tiling") {
    return NextResponse.json({ error: "Already tiling" }, { status: 409 });
  }

  await prisma.basemap.update({
    where: { id: basemap.id },
    data: { tiling_status: "pending", error_message: null },
  });

  const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
  try {
    await triggerBasemapTiling({
      basemap_id: basemap.id,
      download_url: `${baseUrl}/api/files/basemap-sources/${basemap.source_filename}`,
      callback_url: `${baseUrl}/api/basemaps/webhook`,
      farm_centroid: await farmCentroidFor(basemap.farm_id),
      crs_override_epsg: basemap.crs_override_epsg,
    });
  } catch (err) {
    console.error("[basemaps retile]", err);
    await prisma.basemap.update({
      where: { id: basemap.id },
      data: { tiling_status: "failed", error_message: "Failed to reach the processing machine" },
    });
    return NextResponse.json({ error: "Failed to reach the processing machine" }, { status: 502 });
  }

  // Guarded: a fast job's webhook may already have set ready/failed.
  await prisma.basemap.updateMany({ where: { id: basemap.id, tiling_status: "pending" }, data: { tiling_status: "tiling" } });
  return NextResponse.json({ ok: true });
  });
}
