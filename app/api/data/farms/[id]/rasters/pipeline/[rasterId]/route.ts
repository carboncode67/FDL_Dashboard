import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { prisma } from "@/lib/prisma";
import { authenticateUpload } from "@/lib/upload-auth";
import { runWithLab } from "@/lib/lab-db";

// Streams one pipeline output file (GeoTIFF or GeoJSON) for OFE_Dashboard's
// server-side proxy — see ../../route.ts. Scoped to the farm the same way as
// the basemap tile route; "unclear"-CRS outputs are never served here.
export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";
const OUTPUTS_DIR = path.join(DATA_DIR, "pipeline-outputs");

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; rasterId: string }> }
) {
  const auth = await authenticateUpload(req);
  if ("error" in auth) return auth.error;
  return runWithLab(auth.labSlug, async () => {
    const { id, rasterId } = await params;
    const farmId = parseInt(id);
    const outputId = parseInt(rasterId);
    if (isNaN(farmId) || isNaN(outputId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const output = await prisma.pipelineOutputRaster.findFirst({
      where: {
        id: outputId,
        farm_id: farmId,
        OR: [{ crs_status: null }, { crs_status: { not: "unclear" } }],
      },
      select: { filename: true, kind: true },
    });
    if (!output) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const safe = path.basename(output.filename);
    const filePath = path.join(OUTPUTS_DIR, safe);
    if (!fs.existsSync(filePath)) return NextResponse.json({ error: "File not found" }, { status: 404 });

    const ext = safe.split(".").pop()?.toLowerCase() ?? "";
    const contentType =
      ext === "tif" || ext === "tiff" ? "image/tiff"
      : ext === "geojson" || ext === "json" ? "application/geo+json"
      : "application/octet-stream";
    const stat = fs.statSync(filePath);
    const webStream = Readable.toWeb(fs.createReadStream(filePath)) as unknown as ReadableStream;
    return new NextResponse(webStream, {
      headers: { "Content-Type": contentType, "Content-Length": String(stat.size) },
    });
  });
}
