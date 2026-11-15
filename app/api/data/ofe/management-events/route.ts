import { NextResponse } from "next/server";
import { withOfeService } from "@/lib/ofe-sync";
import { listOfeManagementEvents } from "@/lib/ofe-management-sync";

// GET /api/data/ofe/management-events[?farm_id=] — every OFE-owned management
// event's ofe_id (+ the snapshot hash last applied), so OFE's sync job can
// delete here what it has deleted on its side and skip unchanged pushes.
// Service-only (lib/ofe-sync.ts).
export async function GET(req: Request) {
  return withOfeService(req, async () => {
    const raw = new URL(req.url).searchParams.get("farm_id");
    const farmId = raw ? Number(raw) : null;
    if (raw && !Number.isInteger(farmId)) return NextResponse.json({ error: "Invalid farm_id" }, { status: 400 });
    return NextResponse.json(await listOfeManagementEvents(farmId));
  });
}
