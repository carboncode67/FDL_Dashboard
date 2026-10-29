import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { runWithLab } from "@/lib/lab-db";
import { processingConfigured } from "@/lib/processing";
import { yieldRunToProcessing } from "@/lib/yield-runs";

// Map-ready rasters for one farm — the same two sources farms/[id]/page.tsx
// merges for FarmMap (lib/map-rasters.ts): pipeline outputs and tiled
// basemaps. Built for OFE_Dashboard (its lib/fdl-sync.ts fetchFarmRasters()),
// which shows lab-generated rasters to farmers without ever holding the
// files itself; it proxies the two sibling routes below for the bytes.
// Service-only: not in lib/route-scopes.ts's RESTRICTED_ALLOWED_ROUTES.
//
// Only rasters safe to plot are listed — a basemap must be tiling_status
// "ready", and anything geo_sanity flagged crs_status "unclear" is left out
// entirely (FarmMap lists those for manual download; a farmer-facing map
// has no use for an unverified location).
//
// Alongside `rasters` (shape unchanged — older OFE builds read only that):
// `layers` = the farm's Farm_Layers overlays (GeoJSON via ../layers/[layerId]),
// and `processing` = basemaps not yet tiled and yield cards not yet cleaned
// (each with a `kind`: "basemap" | "yield"), so OFE's map can list a fresh
// upload with its status the way FarmMap does, plus `processing_configured`.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;
  return runWithLab(auth.labSlug, async () => {
    const { id } = await params;
    const farmId = parseInt(id);
    if (isNaN(farmId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const farm = await prisma.farm.findUnique({ where: { id: farmId }, select: { id: true } });
    if (!farm) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const notUnclear = { OR: [{ crs_status: null }, { crs_status: { not: "unclear" } }] };
    const [outputs, basemaps, layers, processing, yieldRuns] = await Promise.all([
      prisma.pipelineOutputRaster.findMany({
        where: { farm_id: farmId, ...notUnclear },
        orderBy: { created_at: "desc" },
        include: { Run: { select: { Pipeline: { select: { name: true } } } } },
      }),
      prisma.basemap.findMany({
        where: { farm_id: farmId, tiling_status: "ready", ...notUnclear },
        orderBy: { created_at: "desc" },
      }),
      prisma.farmLayer.findMany({
        where: { farm_id: farmId },
        select: { id: true, name: true, geometry_kind: true, feature_count: true },
        orderBy: { created_at: "desc" },
      }),
      prisma.basemap.findMany({
        where: { farm_id: farmId, tiling_status: { not: "ready" } },
        select: { id: true, display_name: true, original_filename: true, tiling_status: true, error_message: true },
        orderBy: { created_at: "desc" },
      }),
      prisma.yieldRun.findMany({
        where: { farm_id: farmId, status: { not: "ready" } },
        select: { id: true, display_name: true, original_filename: true, status: true, error_message: true },
        orderBy: { created_at: "desc" },
      }),
    ]);

    return NextResponse.json({
      rasters: [
        ...outputs.map((r) => ({
          source: "pipeline" as const,
          id: r.id,
          label: `${r.Run.Pipeline.name} — ${r.original_filename}`,
          kind: r.kind === "vector" ? "vector" : "raster",
          filename: r.original_filename,
          bytes: Number(r.bytes),
          created_at: r.created_at,
        })),
        ...basemaps.map((b) => ({
          source: "basemap" as const,
          id: b.id,
          label: b.display_name || b.original_filename,
          kind: "raster" as const,
          footprint: b.footprint ?? null,
          min_zoom: b.min_zoom,
          max_zoom: b.max_zoom,
          created_at: b.created_at,
          // Cache-buster for the tile URLs — a re-tile rewrites tiles in place.
          updated_at: b.updated_at,
        })),
      ],
      layers,
      processing: [
        ...processing.map((b) => ({
          id: b.id,
          kind: "basemap" as const,
          label: b.display_name || b.original_filename,
          status: b.tiling_status,
          error: b.error_message,
        })),
        ...yieldRuns.map(yieldRunToProcessing),
      ],
      processing_configured: processingConfigured,
    });
  });
}
