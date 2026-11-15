import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runWithTenant } from "@/lib/lab-db";
import { getEffectiveScope, scopeIncludesFarm } from "@/lib/get-user-filters";
import { buildFarmTimeline } from "@/lib/farm-timeline";

export const runtime = "nodejs";

// Farm page timeline: spatial-context lanes (drought weeks, imagery dates) plus
// data-collection events (lib/farm-timeline.ts). `null` when the farm has none.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const farmId = parseInt(id);
  if (isNaN(farmId)) return NextResponse.json({ error: "Invalid farm id" }, { status: 400 });

  const scope = await getEffectiveScope(session.user.id, session.user.category);
  if (!scopeIncludesFarm(scope, farmId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(await buildFarmTimeline(farmId), { headers: { "Cache-Control": "no-store" } });
  });
}
