import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runWithTenant } from "@/lib/lab-db";
import { getEffectiveScope, scopeIncludesFarm } from "@/lib/get-user-filters";

// GET ?farm_id= : what the run form can pick for that farm's file inputs
// (its Documents and ready Basemaps), plus counts for the automatic inputs.
export const runtime = "nodejs";

export async function GET(req: Request) {
  return runWithTenant(async () => {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const farmId = Number(new URL(req.url).searchParams.get("farm_id"));
    if (!Number.isInteger(farmId) || farmId <= 0) return NextResponse.json({ error: "farm_id" }, { status: 400 });
    const scope = await getEffectiveScope(session.user.id ?? null, session.user.category);
    if (!scopeIncludesFarm(scope, farmId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const [documents, basemaps, fields, context] = await Promise.all([
      prisma.document.findMany({ where: { farm_id: farmId }, orderBy: { id: "desc" }, take: 300, select: { id: true, original_name: true, filename: true } }),
      prisma.basemap.findMany({ where: { farm_id: farmId, tiling_status: "ready" }, orderBy: { created_at: "desc" }, select: { id: true, display_name: true, original_filename: true } }),
      prisma.field.count({ where: { Farms_id: farmId, geometry: { not: null } } }),
      prisma.contextRaster.count({ where: { farm_id: farmId } }),
    ]);
    return NextResponse.json({
      documents: documents.map((d) => ({ id: d.id, label: d.original_name || d.filename })),
      basemaps: basemaps.map((b) => ({ id: b.id, label: b.display_name || b.original_filename })),
      fields, context,
    });
  });
}
