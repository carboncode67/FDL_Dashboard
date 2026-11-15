import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runWithTenant } from "@/lib/lab-db";
import { getEffectiveScope, scopeIncludesFarm } from "@/lib/get-user-filters";
import { handleCoverageGet } from "@/lib/context-request";

export const runtime = "nodejs";

// GET /api/farms/[id]/context/coverage — what spatial context the farm already
// has (lib/context-coverage.ts). With ?mode=update|expand (&start_date&end_date
// &products=a,b for expand) it also returns the dry-run plan: exactly what that
// request would fetch, from the same planner the POST uses.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const farmId = parseInt(id);
  if (isNaN(farmId)) return NextResponse.json({ error: "Invalid farm id" }, { status: 400 });

  const scope = await getEffectiveScope(session.user.id, session.user.category);
  if (!scopeIncludesFarm(scope, farmId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return handleCoverageGet(farmId, new URL(req.url));
  });
}
