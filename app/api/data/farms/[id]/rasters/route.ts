import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { runWithLab } from "@/lib/lab-db";

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
    const [outputs, basemaps] = await Promise.all([
      prisma.pipelineOutputRaster.findMany({
        where: { farm_id: farmId, ...notUnclear },
        orderBy: { created_at: "desc" },
        include: { Run: { select: { Pipeline: { select: { name: true } } } } },
      }),
      prisma.basemap.findMany({
        where: { farm_id: farmId, tiling_status: "ready", ...notUnclear },
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
          label: b.original_filename,
          kind: "raster" as const,
          footprint: b.footprint ?? null,
          min_zoom: b.min_zoom,
          max_zoom: b.max_zoom,
          created_at: b.created_at,
        })),
      ],
    });
  });
}
