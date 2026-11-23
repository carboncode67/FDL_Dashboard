import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withTriggerSession } from "@/lib/pipeline-triggers-route";
import { checkRule, TriggerRuleError, type TriggerRuleInput } from "@/lib/pipeline-triggers";
import { fetchPipelineCatalog } from "@/lib/processing";
import { reevaluateGapsQuietly } from "@/lib/processing-gaps";
import type { Prisma } from "@prisma/client";

// Trigger rules for declarative pipelines (migration 107).
// GET: the lab's rules. POST (admin): { pipeline_key, trigger_input, match_table,
// match_category?, match_project_id?, match_data_table_id?, params?, enabled? }.
export const runtime = "nodejs";

export async function GET() {
  return withTriggerSession("read", async ({ labId }) => {
    return NextResponse.json(await prisma.pipelineTrigger.findMany({ where: { lab_id: labId }, orderBy: { id: "asc" } }));
  });
}

export async function POST(req: Request) {
  return withTriggerSession("admin", async ({ session, labId }) => {
    const body = (await req.json().catch(() => ({}))) as TriggerRuleInput;
    const catalog = await fetchPipelineCatalog();
    if (!catalog) return NextResponse.json({ error: "The processing machine isn't reachable" }, { status: 503 });
    const def = catalog.pipelines.find((p) => p.key === body.pipeline_key);
    if (!def) throw new TriggerRuleError(`No pipeline "${body.pipeline_key}" on the processing machine`);
    const r = checkRule(def, body);
    const row = await prisma.pipelineTrigger.create({
      data: {
        lab_id: labId, pipeline_key: r.pipeline_key, trigger_input: r.trigger_input, match_table: r.match_table,
        match_category: r.match_category ?? null, match_project_id: r.match_project_id ?? null,
        match_data_table_id: r.match_data_table_id ?? null, params: (r.params ?? {}) as Prisma.InputJsonValue,
        enabled: r.enabled !== false, created_by_id: session.user.id ?? null,
      },
    });
    reevaluateGapsQuietly(labId);
    return NextResponse.json(row, { status: 201 });
  });
}
