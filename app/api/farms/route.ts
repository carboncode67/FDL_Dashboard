import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreate } from "@/lib/roles";
import { runWithTenant } from "@/lib/lab-db";
import { getEffectiveScope } from "@/lib/get-user-filters";

export async function GET() {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Agronomist hard-scope: same ceiling the page components already enforce for
  // list views (see lib/get-user-filters.ts) — an ordinary Lab Member's optional
  // personal filter is a page-level convenience, not enforced here, but an
  // Agronomist's assigned-project ceiling must hold everywhere this data is
  // reachable, not just server-rendered pages.
  const scope = await getEffectiveScope(session.user.id, session.user.category);
  const where = scope.hardScoped ? { id: { in: scope.farmIds } } : {};
  const farms = await prisma.farm.findMany({ where, orderBy: { id: "asc" } });
  return NextResponse.json(farms);
  });
}

export async function POST(req: Request) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCreate(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const farm = await prisma.farm.create({ data: body });
  return NextResponse.json(farm, { status: 201 });
  });
}
