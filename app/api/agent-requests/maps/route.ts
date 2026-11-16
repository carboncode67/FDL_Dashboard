import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { basePrisma } from "@/lib/prisma";
import { canEdit, type Role } from "@/lib/roles";
import { getEffectiveScope } from "@/lib/get-user-filters";
import { runWithTenant } from "@/lib/lab-db";

// GET /api/agent-requests/maps — sampling maps this person can attach to an agent
// request: same rule as withMapAccess (edit rights, own lab, farm in access scope),
// minus OFE-owned maps (read-only here, so a draft could never be applied).
export async function GET() {
  return runWithTenant(async () => {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canEdit(session.user.role as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const user = await basePrisma.user.findUnique({ where: { id: session.user.id }, select: { lab_id: true } });
    if (!user?.lab_id) return NextResponse.json({ maps: [] });
    const scope = await getEffectiveScope(session.user.id, session.user.category);
    const maps = await basePrisma.samplingMap.findMany({
      where: {
        ofe_id: null,
        Farm: { lab_id: user.lab_id },
        ...(scope.hardScoped ? { farm_id: { in: scope.accessFarmIds.length ? scope.accessFarmIds : [-1] } } : {}),
      },
      select: { id: true, name: true, farm_id: true, Farm: { select: { Farm_Name: true } } },
      orderBy: { updated_at: "desc" },
      take: 300,
    });
    return NextResponse.json({
      maps: maps.map((m) => ({ id: m.id, name: m.name, farm_id: m.farm_id, farm_name: m.Farm.Farm_Name ?? `Farm #${m.farm_id}` })),
    });
  });
}
