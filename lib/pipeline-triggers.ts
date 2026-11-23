import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { processingConfigured, type CatalogPipeline } from "@/lib/processing";
import { resolveFarmForTrigger } from "@/lib/pipeline-farm";
import { cachedCatalog, inputMode, startCatalogRun, UPLOAD_SOURCES, type InputChoice } from "@/lib/pipeline-catalog";

// Automatic triggers for declarative pipelines (migration 107,
// docs/pipeline-requests-plan.md phase 3). A rule says "run pipeline <key>
// when an upload in <match_table> matching category / project / Data Table
// arrives". The upload becomes the rule's trigger_input; every other required
// input must be automatic (farm fields, context rasters). Rules only fire
// while the pipeline is `live` in the processor's catalogue.
//
// Called from lib/pipeline-match.ts's matchAndTriggerPipelines(), i.e. the
// same moments the legacy script pipelines fire: Data Sorting saves, document
// uploads, kept farm documents.

export class TriggerRuleError extends Error {}

export const TRIGGER_TABLES = ["documents", "photos", "lab-member-uploads"] as const;

export type TriggerRuleInput = {
  pipeline_key: string;
  trigger_input: string;
  match_table: string;
  match_category?: string | null;
  match_project_id?: number | null;
  match_data_table_id?: number | null;
  params?: Record<string, unknown>;
  enabled?: boolean;
};

/** Checks a rule against the pipeline's definition; returns the normalised rule. */
export function checkRule(def: CatalogPipeline, r: TriggerRuleInput): TriggerRuleInput {
  const input = def.inputs.find((i) => i.name === r.trigger_input);
  if (!input) throw new TriggerRuleError(`Pipeline ${def.key} has no input "${r.trigger_input}"`);
  const tables = UPLOAD_SOURCES[input.kind];
  if (!tables) throw new TriggerRuleError(`Input "${input.name}" (${input.kind}) can't be filled from an upload`);
  if (!tables.includes(r.match_table)) {
    throw new TriggerRuleError(`Input "${input.name}" takes files from ${tables.join(" or ")}, not ${r.match_table}`);
  }
  for (const other of def.inputs) {
    if (other.name === input.name || !other.required) continue;
    if (inputMode(other.kind) !== "auto") {
      throw new TriggerRuleError(`Input "${other.name}" (${other.kind}) has to be picked by hand, so this pipeline can't run automatically`);
    }
  }
  const params: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r.params ?? {})) {
    if (v === "" || v == null) continue;
    if (!def.params.some((p) => p.name === k)) throw new TriggerRuleError(`Pipeline ${def.key} has no setting "${k}"`);
    params[k] = v;
  }
  const cat = typeof r.match_category === "string" ? r.match_category.trim().slice(0, 100) : "";
  const pid = Number(r.match_project_id);
  const tid = Number(r.match_data_table_id);
  return {
    pipeline_key: def.key,
    trigger_input: input.name,
    match_table: r.match_table,
    match_category: cat || null,
    match_project_id: Number.isInteger(pid) && pid > 0 ? pid : null,
    match_data_table_id: Number.isInteger(tid) && tid > 0 ? tid : null,
    params,
    enabled: r.enabled !== false,
  };
}

function wildcard(field: "match_category" | "match_project_id" | "match_data_table_id", value: string | number | null): Prisma.PipelineTriggerWhereInput {
  if (value === null) return { [field]: null };
  return { OR: [{ [field]: null }, { [field]: value }] };
}

export type TriggerScope = { table: string; category?: string | null; project_id?: number | null; data_table_id?: number | null };

/** Enabled rules matching an upload with this scope (current lab, via RLS). */
export function findMatchingTriggers(scope: TriggerScope) {
  return prisma.pipelineTrigger.findMany({
    where: {
      enabled: true,
      match_table: scope.table,
      AND: [
        wildcard("match_category", scope.category ?? null),
        wildcard("match_project_id", scope.project_id ?? null),
        wildcard("match_data_table_id", scope.data_table_id ?? null),
      ],
    },
    orderBy: { id: "asc" },
  });
}

/**
 * Starts a run for every enabled rule an upload matches, once per pipeline
 * version per upload (a failed earlier run may be retried by a later save).
 * Best-effort: never throws. Returns the run ids started.
 */
export async function fireTriggers(scope: TriggerScope & { id: number }): Promise<number[]> {
  if (!processingConfigured || !(TRIGGER_TABLES as readonly string[]).includes(scope.table)) return [];
  const started: number[] = [];
  try {
    const rules = await findMatchingTriggers(scope);
    if (rules.length === 0) return [];
    const catalog = await cachedCatalog();
    if (!catalog) {
      console.error(`[pipeline triggers] ${scope.table} #${scope.id}: processor unreachable, ${rules.length} rule(s) not fired`);
      return [];
    }
    const farmId = await resolveFarmForTrigger({ table: scope.table, id: scope.id });
    if (farmId == null) return []; // outputs are kept on a farm; an unassigned upload waits for sorting
    for (const rule of rules) {
      const def = catalog.pipelines.find((p) => p.key === rule.pipeline_key);
      if (!def || def.status !== "live") continue;
      const earlier = await prisma.pipelineRunV2.findFirst({
        where: {
          pipeline_key: def.key, pipeline_version: def.version,
          trigger_table: scope.table, trigger_id: scope.id, status: { not: "failed" },
        },
        select: { id: true },
      });
      if (earlier) continue;
      const inputs: Record<string, InputChoice> = {};
      for (const i of def.inputs) {
        inputs[i.name] = i.name === rule.trigger_input ? { upload_table: scope.table, upload_id: scope.id } : inputMode(i.kind) === "auto" ? { auto: true } : null;
      }
      try {
        const run = await startCatalogRun({
          labId: rule.lab_id, farmId, key: def.key, inputs,
          params: (rule.params ?? {}) as Record<string, unknown>, userId: rule.created_by_id,
          trigger: { table: scope.table, id: scope.id, ruleId: rule.id }, catalog,
        });
        started.push(run.id);
      } catch (err) {
        console.error(`[pipeline triggers] rule ${rule.id} on ${scope.table} #${scope.id}`, err);
      }
    }
  } catch (err) {
    console.error(`[pipeline triggers] ${scope.table} #${scope.id}`, err);
  }
  return started;
}

/** True when a declarative pipeline covers this upload: it ran on it, or an enabled rule matches it. */
export async function declarativeCovers(scope: TriggerScope & { id: number }): Promise<boolean> {
  const run = await prisma.pipelineRunV2.findFirst({
    where: { trigger_table: scope.table, trigger_id: scope.id, status: { not: "failed" } },
    select: { id: true },
  });
  if (run) return true;
  return (await findMatchingTriggers(scope)).length > 0;
}
