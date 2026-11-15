import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OfeSyncError, parseOfeId, withOfeService } from "@/lib/ofe-sync";
import { upsertOfeManagementEvent, validateManagementEventInput } from "@/lib/ofe-management-sync";

type Params = { params: Promise<{ ofeId: string }> };

// PUT /api/data/ofe/management-events/[ofeId] — create or replace an OFE-owned
// management event from OFE's whole-event snapshot. Service-only; see
// lib/ofe-management-sync.ts. Returns { id, dropped: string[] } — references
// (experiment / fields / uploads) that weren't on the event's farm here.
// 409 when the operation type hasn't been synced yet (OFE retries next cycle).
export async function PUT(req: Request, { params }: Params) {
  return withOfeService(req, async (service) => {
    const ofeId = parseOfeId((await params).ofeId);
    if (ofeId == null) return NextResponse.json({ error: "Invalid ofe id" }, { status: 400 });
    const input = validateManagementEventInput(await req.json().catch(() => null));
    if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
    try {
      return NextResponse.json(await upsertOfeManagementEvent(ofeId, input, service));
    } catch (err) {
      if (err instanceof OfeSyncError) return NextResponse.json({ error: err.message }, { status: err.status });
      throw err;
    }
  });
}

// DELETE /api/data/ofe/management-events/[ofeId] — OFE deleted the event.
export async function DELETE(req: Request, { params }: Params) {
  return withOfeService(req, async () => {
    const ofeId = parseOfeId((await params).ofeId);
    if (ofeId == null) return NextResponse.json({ error: "Invalid ofe id" }, { status: 400 });
    const { count } = await prisma.managementEvent.deleteMany({ where: { ofe_id: ofeId } });
    return NextResponse.json({ deleted: count });
  });
}
