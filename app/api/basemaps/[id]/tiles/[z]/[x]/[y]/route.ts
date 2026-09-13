import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { auth } from "@/lib/auth";
import { runWithTenant } from "@/lib/lab-db";

// A dedicated route rather than reusing GET /api/files/[type]/[filename]
// (items 6+7, docs/raster-tiling-plan.md §5): Leaflet needs a real
// {z}/{x}/{y} URL template, and that route only ever accepts one flat
// path.basename filename segment, no nesting. Session-authed like any other
// dashboard asset — the browser sends the session cookie automatically on a
// same-origin tile <img>/canvas request, same as an <img src="/api/files/
// photos/...">, so no client-side change is needed to authenticate these.
export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";
const TILES_DIR = path.join(DATA_DIR, "basemap-tiles");

function parseNonNegativeInt(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  return parseInt(raw, 10);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; z: string; x: string; y: string }> }
) {
  return runWithTenant(async () => {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, z, x, y: yRaw } = await params;
    const basemapId = parseNonNegativeInt(id);
    const zNum = parseNonNegativeInt(z);
    const xNum = parseNonNegativeInt(x);
    // y arrives as "<row>.png" — Leaflet's {y} template slot has no separate
    // extension placeholder, so the file extension rides along on this segment.
    const yMatch = yRaw.match(/^(\d+)\.png$/);
    if (basemapId === null || zNum === null || xNum === null || !yMatch) {
      return NextResponse.json({ error: "Invalid tile coordinates" }, { status: 400 });
    }

    const filePath = path.join(TILES_DIR, String(basemapId), String(zNum), String(xNum), `${yMatch[1]}.png`);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Tile not found" }, { status: 404 });
    }

    const buffer = fs.readFileSync(filePath); // individual tiles are small (≤256×256 PNG) — fine to buffer whole
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=86400",
      },
    });
  });
}
