import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runWithTenant } from "@/lib/lab-db";
import { prisma } from "@/lib/prisma";
import { predictionsGeojson, type PredictionShape } from "@/lib/vision";

// A run's predictions as GeoJSON (download). ?source_id= narrows to one
// source; ?shape=box|point|polygon picks the geometry (default: detection
// frames for detection jobs, outlines for segmentation). Ortho features are
// lon/lat; photo features are in pixel space (properties.space says which).
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  return runWithTenant(async () => {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { runId } = await params;
    const run = await prisma.visionRun.findUnique({ where: { id: parseInt(runId) }, select: { id: true } });
    if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const url = new URL(req.url);
    const sourceId = Number(url.searchParams.get("source_id"));
    const shapeParam = url.searchParams.get("shape");
    const shape = (["box", "point", "polygon"] as const).includes(shapeParam as PredictionShape) ? (shapeParam as PredictionShape) : undefined;
    const fc = await predictionsGeojson(run.id, Number.isInteger(sourceId) && sourceId > 0 ? sourceId : undefined, shape);
    return new NextResponse(JSON.stringify(fc), {
      headers: {
        "Content-Type": "application/geo+json",
        "Content-Disposition": `attachment; filename="vision-run-${run.id}${shape ? `-${shape}s` : ""}.geojson"`,
      },
    });
  });
}
