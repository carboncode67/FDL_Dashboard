import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  OfeSyncError,
  parseOfeId,
  upsertOfeSamplingMap,
  validateSamplingMapInput,
  withOfeService,
} from "@/lib/ofe-sync";

type Params = { params: Promise<{ ofeId: string }> };

// PUT /api/data/ofe/sampling-maps/[ofeId] — create or replace an OFE-owned
// sampling map from OFE's whole-map snapshot (polygons, points, assignments).
// Service-only; see lib/ofe-sync.ts. Returns
// { id, points: [{ ofe_id, id }], assignments: [{ ofe_id, resolved }] }.
export async function PUT(req: Request, { params }: Params) {
  return withOfeService(req, async (service) => {
    const ofeId = parseOfeId((await params).ofeId);
    if (ofeId == null) return NextResponse.json({ error: "Invalid ofe id" }, { status: 400 });
    const input = validateSamplingMapInput(await req.json().catch(() => null));
    if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
    try {
      return NextResponse.json(await upsertOfeSamplingMap(ofeId, input, service));
    } catch (err) {
      if (err instanceof OfeSyncError) return NextResponse.json({ error: err.message }, { status: err.status });
      throw err;
    }
  });
}

// DELETE /api/data/ofe/sampling-maps/[ofeId] — OFE deleted the map.
export async function DELETE(req: Request, { params }: Params) {
  return withOfeService(req, async () => {
    const ofeId = parseOfeId((await params).ofeId);
    if (ofeId == null) return NextResponse.json({ error: "Invalid ofe id" }, { status: 400 });
    const { count } = await prisma.samplingMap.deleteMany({ where: { ofe_id: ofeId } });
    return NextResponse.json({ deleted: count });
  });
}
