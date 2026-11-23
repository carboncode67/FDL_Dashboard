import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withTriggerSession } from "@/lib/pipeline-triggers-route";
import { checkRule, TriggerRuleError, type TriggerRuleInput } from "@/lib/pipeline-triggers";
import { fetchPipelineCatalog } from "@/lib/processing";
import { reevaluateGapsQuietly } from "@/lib/processing-gaps";
import type { Prisma } from "@prisma/client";

// PATCH (admin): { enabled } alone, or a full rule (re-checked against the
// pipeline's current definition). DELETE (admin). Past runs keep their record.
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function load(idParam: string, labId: number) {
  const id = Number(idParam);
  return Number.isInteger(id) && id > 0 ? prisma.pipelineTrigger.findFirst({ where: { id, lab_id: labId } }) : null;
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  return withTriggerSession("admin", async ({ labId }) => {
    const rule = await load(id, labId);
    if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = (await req.json().catch(() => ({}))) as Partial<TriggerRuleInput>;
    let data: Prisma.PipelineTriggerUpdateInput;
    if (Object.keys(body).length === 1 && typeof body.enabled === "boolean") {
      data = { enabled: body.enabled };
    } else {
      const catalog = await fetchPipelineCatalog();
      if (!catalog) return NextResponse.json({ error: "The processing machine isn't reachable" }, { status: 503 });
      const def = catalog.pipelines.find((p) => p.key === rule.pipeline_key);
      if (!def) throw new TriggerRuleError(`Pipeline "${rule.pipeline_key}" is no longer on the processing machine`);
      const r = checkRule(def, {
        pipeline_key: rule.pipeline_key,
        trigger_input: body.trigger_input ?? rule.trigger_input,
        match_table: body.match_table ?? rule.match_table,
        match_category: body.match_category !== undefined ? body.match_category : rule.match_category,
        match_project_id: body.match_project_id !== undefined ? body.match_project_id : rule.match_project_id,
        match_data_table_id: body.match_data_table_id !== undefined ? body.match_data_table_id : rule.match_data_table_id,
        params: body.params ?? (rule.params as Record<string, unknown>),
        enabled: body.enabled ?? rule.enabled,
      });
      data = {
        trigger_input: r.trigger_input, match_table: r.match_table, match_category: r.match_category ?? null,
        match_project_id: r.match_project_id ?? null, match_data_table_id: r.match_data_table_id ?? null,
        params: (r.params ?? {}) as Prisma.InputJsonValue, enabled: r.enabled !== false,
      };
    }
    const row = await prisma.pipelineTrigger.update({ where: { id: rule.id }, data });
    reevaluateGapsQuietly(labId);
    return NextResponse.json(row);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return withTriggerSession("admin", async ({ labId }) => {
    const rule = await load(id, labId);
    if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.pipelineTrigger.delete({ where: { id: rule.id } });
    reevaluateGapsQuietly(labId);
    return NextResponse.json({ ok: true });
  });
}
