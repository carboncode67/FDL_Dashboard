import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { runWithLab } from "@/lib/lab-db";

// Bearer-token twin of GET /api/basemaps/[id]/tiles/[z]/[x]/[y], for
// OFE_Dashboard's server-side tile proxy (see the sibling
// rasters/route.ts). Nested
// under the farm so the basemap must actually belong to the farm OFE asked
// for — OFE authorizes its user against the farm, this route authorizes the
// basemap against that same farm.
export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";
const TILES_DIR = path.join(DATA_DIR, "basemap-tiles");

function parseNonNegativeInt(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  return parseInt(raw, 10);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; rasterId: string; z: string; x: string; y: string }> }
) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;
  return runWithLab(auth.labSlug, async () => {
    const { id, rasterId, z, x, y: yRaw } = await params;
    const farmId = parseNonNegativeInt(id);
    const basemapId = parseNonNegativeInt(rasterId);
    const zNum = parseNonNegativeInt(z);
    const xNum = parseNonNegativeInt(x);
    const yMatch = yRaw.match(/^(\d+)\.png$/);
    if (farmId === null || basemapId === null || zNum === null || xNum === null || !yMatch) {
      return NextResponse.json({ error: "Invalid tile coordinates" }, { status: 400 });
    }

    const basemap = await prisma.basemap.findFirst({
      where: { id: basemapId, farm_id: farmId, tiling_status: "ready" },
      select: { id: true },
    });
    if (!basemap) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const filePath = path.join(TILES_DIR, String(basemapId), String(zNum), String(xNum), `${yMatch[1]}.png`);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Tile not found" }, { status: 404 });
    }

    return new NextResponse(fs.readFileSync(filePath), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=86400",
      },
    });
  });
}
