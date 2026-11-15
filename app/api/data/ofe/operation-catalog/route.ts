import { NextResponse } from "next/server";
import { OfeSyncError, withOfeService } from "@/lib/ofe-sync";
import { upsertOfeOperationCatalog, validateOperationCatalogInput } from "@/lib/ofe-management-sync";

// PUT /api/data/ofe/operation-catalog — OFE's whole operation catalog
// (categories + types), upserted per lab by ofe_id. OFE sends it before any
// management events, which reference types by ofe_id. Service-only
// (lib/ofe-sync.ts); see lib/ofe-management-sync.ts.
export async function PUT(req: Request) {
  return withOfeService(req, async (service) => {
    const input = validateOperationCatalogInput(await req.json().catch(() => null));
    if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
    try {
      return NextResponse.json(await upsertOfeOperationCatalog(input, service));
    } catch (err) {
      if (err instanceof OfeSyncError) return NextResponse.json({ error: err.message }, { status: err.status });
      throw err;
    }
  });
}
