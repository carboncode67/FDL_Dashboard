import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { basePrisma } from "@/lib/prisma";
import { canEdit, type Role } from "@/lib/roles";
import { getEffectiveScope, scopeIncludesFarm } from "@/lib/get-user-filters";
import { runWithTenant } from "@/lib/lab-db";
import { RequestError } from "@/lib/agent/requests";

/**
 * Session access for the agent-request routes: signed in, edit rights, and the
 * sampling map in the user's own lab and farm scope. Same 404 for "doesn't exist"
 * and "not yours".
 */
export interface MapAccess {
  session: Session;
  userId: string;
  labId: number;
  map: { id: number; farm_id: number; ofe_id: number | null };
}

export async function withMapAccess(
  mapId: number,
  fn: (ctx: MapAccess) => Promise<NextResponse>,
): Promise<NextResponse> {
  return runWithTenant(async () => {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!Number.isInteger(mapId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const user = await basePrisma.user.findUnique({ where: { id: session.user.id }, select: { lab_id: true } });
    const map = await basePrisma.samplingMap.findUnique({
      where: { id: mapId },
      select: { id: true, farm_id: true, ofe_id: true, Farm: { select: { lab_id: true } } },
    });
    if (!user?.lab_id || !map || map.Farm.lab_id !== user.lab_id) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const scope = await getEffectiveScope(session.user.id, session.user.category);
    if (!scopeIncludesFarm(scope, map.farm_id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    try {
      return await fn({ session, userId: session.user.id, labId: user.lab_id, map: { id: map.id, farm_id: map.farm_id, ofe_id: map.ofe_id } });
    } catch (e) {
      if (e instanceof RequestError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }
  });
}
