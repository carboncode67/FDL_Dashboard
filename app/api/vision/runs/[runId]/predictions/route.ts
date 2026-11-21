import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runWithTenant } from "@/lib/lab-db";
import { prisma } from "@/lib/prisma";
import { predictionsGeojson } from "@/lib/vision";

// A run's predictions as GeoJSON (download). ?source_id= narrows to one
// source. Ortho features are lon/lat; photo features are in pixel space
// (properties.space says which).
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  return runWithTenant(async () => {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { runId } = await params;
    const run = await prisma.visionRun.findUnique({ where: { id: parseInt(runId) }, select: { id: true } });
    if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const sourceId = Number(new URL(req.url).searchParams.get("source_id"));
    const fc = await predictionsGeojson(run.id, Number.isInteger(sourceId) && sourceId > 0 ? sourceId : undefined);
    return new NextResponse(JSON.stringify(fc), {
      headers: {
        "Content-Type": "application/geo+json",
        "Content-Disposition": `attachment; filename="vision-run-${run.id}.geojson"`,
      },
    });
  });
}
