import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withOfeService } from "@/lib/ofe-sync";

// GET /api/data/ofe/sampling-maps — every OFE-owned map's ofe_id, so OFE's
// sync job can delete here what it has deleted on its side, plus the points
// dropped on a phone that OFE hasn't claimed yet (ofe_id NULL), so they reach
// OFE even when no form response references them. Service-only.
export async function GET(req: Request) {
  return withOfeService(req, async () => {
    const maps = await prisma.samplingMap.findMany({
      where: { ofe_id: { not: null } },
      select: {
        id: true,
        ofe_id: true,
        Points: {
          where: { ofe_id: null },
          select: { id: true, label: true, geometry: true },
          orderBy: { id: "asc" },
        },
      },
    });
    return NextResponse.json(
      maps.map((m) => ({
        id: m.id,
        ofe_id: m.ofe_id,
        field_points: m.Points.map((p) => ({ fdl_id: p.id, label: p.label, geometry: p.geometry })),
      })),
    );
  });
}
