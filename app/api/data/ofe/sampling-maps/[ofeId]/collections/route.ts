import { NextResponse } from "next/server";
import { listOfeMapCollections, parseOfeId, withOfeService } from "@/lib/ofe-sync";

type Params = { params: Promise<{ ofeId: string }> };

// GET /api/data/ofe/sampling-maps/[ofeId]/collections?after_id=N&limit=M —
// phone "Mark Collected" events on an OFE-owned map's points, oldest first,
// for OFE to pull back. Service-only; see lib/ofe-sync.ts.
export async function GET(req: Request, { params }: Params) {
  return withOfeService(req, async () => {
    const ofeId = parseOfeId((await params).ofeId);
    if (ofeId == null) return NextResponse.json({ error: "Invalid ofe id" }, { status: 400 });
    const { searchParams } = new URL(req.url);
    const afterId = Math.max(0, parseInt(searchParams.get("after_id") ?? "0") || 0);
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "200") || 200));
    const collections = await listOfeMapCollections(ofeId, afterId, limit);
    if (!collections) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(collections);
  });
}
