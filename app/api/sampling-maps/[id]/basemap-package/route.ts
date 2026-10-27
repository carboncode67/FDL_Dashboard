import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import fs from "fs";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEdit } from "@/lib/roles";
import { runWithTenant } from "@/lib/lab-db";
import { processingConfigured, triggerNaipPackage } from "@/lib/processing";
import { estimateNaipTiles, NAIP_MAX_TILES, NAIP_MIN_ZOOM, parseNaipBbox } from "@/lib/naip-bbox";
import { NAIP_PENDING_TIMEOUT_MS, naipPackageMaxZoom, naipPackagePath, naipPackageState } from "@/lib/naip-package";

// Build / inspect / remove the NAIP MBTiles package for one sampling map's
// bounding box (Sampling_Maps.naip_bbox). See lib/naip-package.ts.
export const runtime = "nodejs";

async function loadMap(id: string) {
  const mapId = parseInt(id);
  if (isNaN(mapId)) return null;
  return prisma.samplingMap.findUnique({ where: { id: mapId } });
}

// Status poll for the editor panel.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const map = await loadMap((await params).id);
    if (!map) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(naipPackageState(map));
  });
}

// Start a build. The processor renders in the background and calls
// /api/naip/packages/webhook when it finishes.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!processingConfigured) {
      return NextResponse.json({ error: "Processing service not configured" }, { status: 503 });
    }

    const map = await loadMap((await params).id);
    if (!map) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const bbox = parseNaipBbox(map.naip_bbox);
    if (!bbox) return NextResponse.json({ error: "Draw an imagery box first" }, { status: 400 });

    const maxZoom = naipPackageMaxZoom(map.basemap_max_zoom);
    const { tiles } = estimateNaipTiles(bbox, maxZoom);
    if (tiles > NAIP_MAX_TILES) {
      return NextResponse.json({ error: "Box is too large at this max zoom" }, { status: 400 });
    }

    if (
      map.naip_package_status === "pending" &&
      map.naip_package_requested_at &&
      Date.now() - map.naip_package_requested_at.getTime() < NAIP_PENDING_TIMEOUT_MS
    ) {
      return NextResponse.json({ error: "A build is already running" }, { status: 409 });
    }

    const updated = await prisma.samplingMap.update({
      where: { id: map.id },
      data: { naip_package_status: "pending", naip_package_requested_at: new Date(), naip_package_error: null },
    });

    const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
    try {
      await triggerNaipPackage({
        package_id: map.id,
        callback_url: `${baseUrl}/api/naip/packages/webhook`,
        bbox,
        min_zoom: NAIP_MIN_ZOOM,
        max_zoom: maxZoom,
      });
    } catch (err) {
      console.error("[naip package POST] trigger failed", err);
      const failed = await prisma.samplingMap.update({
        where: { id: map.id },
        data: { naip_package_status: "failed", naip_package_error: "Failed to reach the processing machine" },
      });
      return NextResponse.json(naipPackageState(failed), { status: 502 });
    }
    return NextResponse.json(naipPackageState(updated), { status: 202 });
  });
}

// Remove the package (the box itself stays). Phones that already downloaded it keep it.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const map = await loadMap((await params).id);
    if (!map) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const cleared = await prisma.samplingMap.update({
      where: { id: map.id },
      data: {
        naip_package_status: null,
        naip_package_requested_at: null,
        naip_package_error: null,
        naip_package_built_at: null,
        naip_package_bbox: Prisma.DbNull,
        naip_package_min_zoom: null,
        naip_package_max_zoom: null,
        naip_package_tiles: null,
        naip_package_bytes: null,
        naip_package_sha256: null,
      },
    });
    fs.unlink(naipPackagePath(map.id), () => {});
    return NextResponse.json(naipPackageState(cleared));
  });
}
