import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runWithTenant } from "@/lib/lab-db";
import { getEffectiveScope, scopeIncludesFarm } from "@/lib/get-user-filters";
import { buildContextTimeline } from "@/lib/context-timeline";

export const runtime = "nodejs";

// Farm map spatial-context timeline: weekly drought shares + dated imagery on
// the pulled date range. `null` when the farm has no time-varying context yet.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const farmId = parseInt(id);
  if (isNaN(farmId)) return NextResponse.json({ error: "Invalid farm id" }, { status: 400 });

  const scope = await getEffectiveScope(session.user.id, session.user.category);
  if (!scopeIncludesFarm(scope, farmId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const timeline = await buildContextTimeline(farmId);
  return NextResponse.json(timeline, { headers: { "Cache-Control": "no-store" } });
  });
}
