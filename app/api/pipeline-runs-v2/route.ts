import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canEdit, type Role } from "@/lib/roles";
import { effectiveLabSlug, runWithLab } from "@/lib/lab-db";
import { agentLabId } from "@/lib/agent/admin";
import { getEffectiveScope, scopeIncludesFarm } from "@/lib/get-user-filters";
import { CatalogRunError, startCatalogRun, type InputChoice } from "@/lib/pipeline-catalog";

// Declarative pipeline runs (migration 106, lib/pipeline-catalog.ts).
// GET ?farm_id= : recent runs (all farms in scope without it).
// POST { farm_id, key, inputs: {name: {document_id}|{basemap_id}|{auto}|null}, params } : start one (editors).
export const runtime = "nodejs";

async function ctx() {
  const session = await auth();
  if (!session?.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const slug = await effectiveLabSlug(session);
  const labId = await agentLabId(session, slug);
  if (labId == null) return { error: NextResponse.json({ error: "Your account has no lab" }, { status: 400 }) } as const;
  return { session, slug, labId } as const;
}

export async function GET(req: Request) {
  const c = await ctx();
  if ("error" in c) return c.error;
  return runWithLab(c.slug, async () => {
    const farmId = Number(new URL(req.url).searchParams.get("farm_id"));
    const scope = await getEffectiveScope(c.session.user.id ?? null, c.session.user.category);
    const rows = await prisma.pipelineRunV2.findMany({
      where: {
        lab_id: c.labId,
        ...(Number.isInteger(farmId) && farmId > 0 ? { farm_id: farmId } : scope.hardScoped ? { farm_id: { in: scope.accessFarmIds } } : {}),
      },
      orderBy: { created_at: "desc" },
      take: 100,
      include: { Farm: { select: { Farm_Name: true } } },
    });
    return NextResponse.json(rows.filter((r) => r.farm_id == null || scopeIncludesFarm(scope, r.farm_id)));
  });
}

export async function POST(req: Request) {
  const c = await ctx();
  if ("error" in c) return c.error;
  if (!canEdit((c.session.user.role ?? "viewer") as Role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return runWithLab(c.slug, async () => {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const farmId = Number(body.farm_id);
    if (!Number.isInteger(farmId) || farmId <= 0) return NextResponse.json({ error: "Pick a farm" }, { status: 400 });
    const scope = await getEffectiveScope(c.session.user.id ?? null, c.session.user.category);
    if (!scopeIncludesFarm(scope, farmId)) return NextResponse.json({ error: "That farm isn't available to you" }, { status: 403 });
    if (typeof body.key !== "string") return NextResponse.json({ error: "Pick a pipeline" }, { status: 400 });
    try {
      const run = await startCatalogRun({
        labId: c.labId, farmId, key: body.key,
        inputs: (body.inputs && typeof body.inputs === "object" ? body.inputs : {}) as Record<string, InputChoice>,
        params: (body.params && typeof body.params === "object" ? body.params : {}) as Record<string, unknown>,
        userId: c.session.user.id ?? null,
      });
      return NextResponse.json(run, { status: 201 });
    } catch (err) {
      if (err instanceof CatalogRunError) return NextResponse.json({ error: err.message }, { status: 400 });
      throw err;
    }
  });
}
