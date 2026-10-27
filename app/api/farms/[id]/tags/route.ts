import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { runWithTenant } from "@/lib/lab-db";
import { getEffectiveScope, scopeIncludesFarm } from "@/lib/get-user-filters";

// Replace a farm's full tag set. Open to every signed-in user (viewers included) — tagging is
// organisation, not data editing — but still bounded by the Agronomist farm scope.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithTenant(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const farmId = parseInt(id);
  const farm = await prisma.farm.findUnique({ where: { id: farmId }, select: { id: true } });
  if (!farm) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const scope = await getEffectiveScope(session.user.id, session.user.category);
  if (!scopeIncludesFarm(scope, farmId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const requested: number[] = Array.isArray(body.tag_ids)
    ? body.tag_ids.map((v: unknown) => Number(v)).filter((n: number) => Number.isInteger(n))
    : [];
  // Only ids that resolve to a tag visible in this lab — RLS would reject the rest anyway
  // under a per-lab role, but under nocodb (TENANT_ENFORCEMENT=off) this is the only check.
  const tags = await prisma.farmTag.findMany({ where: { id: { in: requested } }, select: { id: true } });
  const tagIds = tags.map((t) => t.id);

  await prisma.$transaction([
    prisma.farmTagLink.deleteMany({ where: { farm_id: farmId } }),
    ...(tagIds.length > 0
      ? [prisma.farmTagLink.createMany({
          data: tagIds.map((tag_id) => ({ farm_id: farmId, tag_id })),
          skipDuplicates: true,
        })]
      : []),
  ]);

  return NextResponse.json({ tag_ids: tagIds });
  });
}
