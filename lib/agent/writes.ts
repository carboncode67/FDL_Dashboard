import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AgentAuth } from "@/lib/agent/auth";
import { agentTableHasId, getAgentRow, getAgentTable } from "@/lib/agent/registry";
import { ObservationError, writeObservation } from "@/lib/agent/observations";
import { RequestError, writeGeoDraft } from "@/lib/agent/requests";

/**
 * Validation for every agent write (docs/agent-sandbox-plan.md §4).
 * The agent writes only to its own Agent_* tables, and every write must:
 *   - belong to an open run of the calling token (run_id),
 *   - fit in that run's write budget,
 *   - reference only records that exist in the token's lab,
 *   - be plain text: no URLs, markdown links/images, HTML, or code fences.
 * Anything that would change research data is an Agent_Recommendations row;
 * applying it is a human action through the normal session routes.
 */

export class AgentWriteError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type Body = Record<string, unknown>;

// ── primitive validators ────────────────────────────────────────────────────

const URL_LIKE = /(https?:\/\/|ftp:\/\/|www\.|\]\(|<\/?[a-z][^>]*>|data:[a-z]+\/)/i;
const CODE_FENCE = /```|~~~/;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function text(body: Body, key: string, max: number, opts: { required?: boolean; noCode?: boolean } = {}): string | null {
  const v = body[key];
  if (v == null || v === "") {
    if (opts.required) throw new AgentWriteError(`${key} is required`);
    return null;
  }
  if (typeof v !== "string") throw new AgentWriteError(`${key} must be a string`);
  const s = v.replace(CONTROL_CHARS, "").trim();
  if (opts.required && !s) throw new AgentWriteError(`${key} is required`);
  if (s.length > max) throw new AgentWriteError(`${key} is longer than ${max} characters`);
  if (URL_LIKE.test(s)) throw new AgentWriteError(`${key} must be plain text — no URLs, links, images or HTML`);
  if (opts.noCode && CODE_FENCE.test(s)) throw new AgentWriteError(`${key} must be prose — no code blocks`);
  return s;
}

function int(body: Body, key: string, required = true): number | null {
  const v = body[key];
  if (v == null) {
    if (required) throw new AgentWriteError(`${key} is required`);
    return null;
  }
  if (typeof v !== "number" || !Number.isInteger(v)) throw new AgentWriteError(`${key} must be an integer`);
  return v;
}

function confidence(body: Body): number | null {
  const v = body.confidence;
  if (v == null) return null;
  if (typeof v !== "number" || v < 0 || v > 1) throw new AgentWriteError("confidence must be a number from 0 to 1");
  return v;
}

function oneOf<T extends string>(body: Body, key: string, allowed: readonly T[]): T {
  const v = body[key];
  if (typeof v !== "string" || !allowed.includes(v as T)) {
    throw new AgentWriteError(`${key} must be one of: ${allowed.join(", ")}`);
  }
  return v as T;
}

/** Any string anywhere inside a JSON value goes through the same plain-text rule. */
function checkJsonStrings(value: unknown, key: string, depth = 0): void {
  if (depth > 6) throw new AgentWriteError(`${key} is nested too deeply`);
  if (typeof value === "string") {
    if (URL_LIKE.test(value)) throw new AgentWriteError(`${key} must be plain text — no URLs, links, images or HTML`);
  } else if (Array.isArray(value)) {
    value.forEach((v) => checkJsonStrings(v, key, depth + 1));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((v) => checkJsonStrings(v, key, depth + 1));
  }
}

function jsonObject(body: Body, key: string, maxBytes: number, required: boolean): Prisma.InputJsonObject | null {
  const v = body[key];
  if (v == null) {
    if (required) throw new AgentWriteError(`${key} is required`);
    return null;
  }
  if (typeof v !== "object" || Array.isArray(v)) throw new AgentWriteError(`${key} must be an object`);
  if (JSON.stringify(v).length > maxBytes) throw new AgentWriteError(`${key} is larger than ${maxBytes} bytes`);
  checkJsonStrings(v, key);
  return v as Prisma.InputJsonObject;
}

// ── record references (lab-checked) ─────────────────────────────────────────

async function requireRecord(labId: number, table: unknown, id: unknown, label: string) {
  if (typeof table !== "string" || !getAgentTable(table)) throw new AgentWriteError(`${label}_table is not a readable table`);
  if (!agentTableHasId(table)) throw new AgentWriteError(`${label}_table has no single id to reference`);
  if (typeof id !== "number" || !Number.isInteger(id)) throw new AgentWriteError(`${label}_id must be an integer`);
  const row = await getAgentRow(table, labId, id);
  // Same answer for "doesn't exist" and "another lab's" — don't leak which.
  if (!row) throw new AgentWriteError(`${label}: ${table} #${id} not found`, 404);
  return { table, id, row };
}

const MAX_EVIDENCE = 20;

/** [{table, id, role?}] — each must exist in the lab. */
async function references(labId: number, body: Body, key: string, withRole: boolean) {
  const v = body[key] ?? [];
  if (!Array.isArray(v)) throw new AgentWriteError(`${key} must be an array`);
  if (v.length > MAX_EVIDENCE) throw new AgentWriteError(`${key} has more than ${MAX_EVIDENCE} entries`);
  const out: Prisma.InputJsonObject[] = [];
  for (const [i, ref] of v.entries()) {
    if (!ref || typeof ref !== "object") throw new AgentWriteError(`${key}[${i}] must be {table, id}`);
    const r = ref as Body;
    await requireRecord(labId, r.table, r.id, `${key}[${i}]`);
    const role = withRole ? text(r, "role", 100) : null;
    out.push({ table: r.table as string, id: r.id as number, ...(role ? { role } : {}) });
  }
  return out;
}

// ── run + budget ────────────────────────────────────────────────────────────

async function claimWrite(agent: AgentAuth, body: Body): Promise<number> {
  const runId = int(body, "run_id")!;
  // One atomic statement: the run is this token's, in this lab, open, and
  // under budget — otherwise nothing is counted and the write is refused.
  const claimed = await prisma.$executeRaw`
    UPDATE "pgntarg2udzj1f3"."Agent_Runs"
       SET write_count = write_count + 1
     WHERE id = ${runId} AND token_id = ${agent.token.id} AND lab_id = ${agent.labId}
       AND status = 'open' AND write_count < write_budget`;
  if (claimed === 1) return runId;

  const run = await prisma.agentRun.findFirst({
    where: { id: runId, token_id: agent.token.id, lab_id: agent.labId },
    select: { status: true },
  });
  if (!run) throw new AgentWriteError(`run ${runId} not found`, 404);
  if (run.status !== "open") throw new AgentWriteError(`run ${runId} is ${run.status}`, 409);
  throw new AgentWriteError(`run ${runId} has used its write budget`, 429);
}

// ── writers ─────────────────────────────────────────────────────────────────

const LINK_RELATIONS = ["calibration_reference", "same_event", "supports", "contradicts", "input_to", "duplicate_of"] as const;
const RECOMMENDATION_KINDS = ["upload_sort", "data_correction", "analysis_parameter", "tag_new"] as const;
const UPLOAD_TABLES = ["photos", "recordings", "notes", "locations", "lab_member_uploads", "videos", "documents"];
const UPLOAD_SORT_FIELDS = ["category", "description", "project_id"];
// Reference columns in a proposed change → the table their value must exist in
// (within the token's lab). Unknown *_id columns are refused outright.
const PROPOSED_REFS: Record<string, string> = {
  farm_id: "farms", Farms_id: "farms", field_id: "fields", Fields_id: "fields",
  project_id: "projects", Projects_id: "projects", experiment_id: "farm_experiments",
  test_id: "tests", treatment_id: "treatments", drone_id: "drones", crop_id: "crops",
  form_id: "forms", pipeline_id: "pipelines", yield_run_id: "yield_runs", basemap_id: "basemaps",
  sampling_map_id: "sampling_maps", sampling_point_id: "sampling_points", data_table_id: "data_tables",
  operation_type_id: "operation_types",
};

/** Every reference-looking key in `proposed` must point at a record in the lab. */
async function checkProposedRefs(labId: number, proposed: Prisma.InputJsonObject) {
  for (const [k, v] of Object.entries(proposed)) {
    if (!/(_id|_Id|_ID)$/.test(k) && !(k in PROPOSED_REFS)) continue;
    if (v == null) continue;
    const table = PROPOSED_REFS[k];
    if (!table) throw new AgentWriteError(`proposed.${k}: not a reference the agent may propose`);
    await requireRecord(labId, table, v, `proposed.${k}`);
  }
}

// Never proposable as a data correction, whatever the table.
const UNCORRECTABLE = new Set(["id", "lab_id", "created_at", "updated_at", "received_at", "content_hash", "sha256"]);

async function writeComment(agent: AgentAuth, body: Body) {
  const target = await requireRecord(agent.labId, body.target_table, body.target_id, "target");
  const fields = {
    body: text(body, "body", 2000, { required: true })!,
    confidence: confidence(body),
    evidence: await references(agent.labId, body, "evidence", false),
  };
  const run_id = await claimWrite(agent, body);
  return prisma.agentComment.create({
    data: { lab_id: agent.labId, run_id, target_table: target.table, target_id: target.id, ...fields },
    select: { id: true },
  });
}

async function writeTag(agent: AgentAuth, body: Body) {
  const target = await requireRecord(agent.labId, body.target_table, body.target_id, "target");
  const tagId = int(body, "tag_id")!;
  const tag = await prisma.agentTagVocabulary.findFirst({ where: { id: tagId, lab_id: agent.labId } });
  if (!tag) throw new AgentWriteError(`tag ${tagId} is not in this lab's vocabulary — propose it with kind "tag_new"`, 404);

  const existing = await prisma.agentTagLink.findFirst({
    where: { lab_id: agent.labId, target_table: target.table, target_id: target.id, tag_id: tagId, status: { in: ["open", "accepted"] } },
    select: { id: true },
  });
  if (existing) return { ...existing, duplicate: true };

  const fields = { confidence: confidence(body), evidence: await references(agent.labId, body, "evidence", false) };
  const run_id = await claimWrite(agent, body);
  return prisma.agentTagLink.create({
    data: { lab_id: agent.labId, run_id, target_table: target.table, target_id: target.id, tag_id: tagId, ...fields },
    select: { id: true },
  });
}

async function writeLink(agent: AgentAuth, body: Body) {
  const source = await requireRecord(agent.labId, body.source_table, body.source_id, "source");
  const target = await requireRecord(agent.labId, body.target_table, body.target_id, "target");
  if (source.table === target.table && source.id === target.id) throw new AgentWriteError("a record can't link to itself");
  const fields = {
    relation: oneOf(body, "relation", LINK_RELATIONS),
    rationale: text(body, "rationale", 1000, { required: true })!,
    confidence: confidence(body),
    evidence: await references(agent.labId, body, "evidence", false),
  };
  const run_id = await claimWrite(agent, body);
  return prisma.agentLink.create({
    data: {
      lab_id: agent.labId,
      run_id,
      source_table: source.table,
      source_id: source.id,
      target_table: target.table,
      target_id: target.id,
      ...fields,
    },
    select: { id: true },
  });
}

async function writeRecommendation(agent: AgentAuth, body: Body) {
  const kind = oneOf(body, "kind", RECOMMENDATION_KINDS);
  const proposed = jsonObject(body, "proposed", 8_000, true)!;
  let target: Awaited<ReturnType<typeof requireRecord>> | null = null;
  let snapshot: Prisma.InputJsonObject | null = null;

  if (kind === "tag_new") {
    const name = text(proposed as Body, "name", 60, { required: true })!;
    text(proposed as Body, "description", 300);
    const clash = await prisma.agentTagVocabulary.findFirst({
      where: { lab_id: agent.labId, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (clash) throw new AgentWriteError(`tag "${name}" already exists as tag ${clash.id}`, 409);
  } else {
    target = await requireRecord(agent.labId, body.target_table, body.target_id, "target");
    // Recommendations change research data; the agent's own rows aren't that.
    if (getAgentTable(target.table)?.agentAuthored) {
      throw new AgentWriteError(`${target.table} is agent-authored — comment on it instead of recommending a change`);
    }
    const keys = Object.keys(proposed);
    if (!keys.length) throw new AgentWriteError("proposed must name at least one change");

    if (kind === "upload_sort") {
      if (!UPLOAD_TABLES.includes(target.table)) throw new AgentWriteError("upload_sort targets an upload table");
      const bad = keys.filter((k) => !UPLOAD_SORT_FIELDS.includes(k));
      if (bad.length) throw new AgentWriteError(`upload_sort can only propose ${UPLOAD_SORT_FIELDS.join(", ")} (got ${bad.join(", ")})`);
      if (proposed.category != null) {
        const categories = await prisma.uploadCategory.findMany({ where: { lab_id: agent.labId }, select: { name: true } });
        if (categories.length && !categories.some((c) => c.name === proposed.category)) {
          throw new AgentWriteError(`category must be one of the lab's upload categories: ${categories.map((c) => c.name).join(", ")}`);
        }
      }
      if (proposed.project_id != null) await requireRecord(agent.labId, "projects", proposed.project_id, "proposed.project");
    }

    if (kind === "data_correction") {
      const bad = keys.filter((k) => UNCORRECTABLE.has(k) || !(k in target!.row));
      if (bad.length) throw new AgentWriteError(`not correctable on ${target.table}: ${bad.join(", ")}`);
    }
    if (kind === "data_correction" || kind === "analysis_parameter") {
      await checkProposedRefs(agent.labId, proposed);
    }

    // Snapshot the target's current values server-side — never trust the
    // agent's idea of "before". For analysis_parameter the keys usually
    // aren't columns, so the snapshot is just whichever ones are.
    snapshot = Object.fromEntries(
      keys.filter((k) => k in target!.row).map((k) => [k, (target!.row[k] ?? null) as Prisma.InputJsonValue | null]),
    );
  }

  const fields = {
    rationale: text(body, "rationale", 2000, { required: true })!,
    computation: jsonObject(body, "computation", 16_000, false),
    confidence: confidence(body),
    evidence: await references(agent.labId, body, "evidence", false),
  };
  const run_id = await claimWrite(agent, body);
  return prisma.agentRecommendation.create({
    data: {
      lab_id: agent.labId,
      run_id,
      kind,
      target_table: target?.table ?? null,
      target_id: target?.id ?? null,
      proposed,
      current_snapshot: snapshot ?? Prisma.DbNull,
      ...fields,
      computation: fields.computation ?? Prisma.DbNull,
    },
    select: { id: true },
  });
}

async function writeSpec(agent: AgentAuth, body: Body) {
  const prose = { required: true, noCode: true };
  const fields = {
    title: text(body, "title", 200, prose)!,
    problem: text(body, "problem", 4000, prose)!,
    method: text(body, "method", 8000, prose)!,
    expected_outputs: text(body, "expected_outputs", 4000, prose)!,
    validation: text(body, "validation", 4000, { noCode: true }),
    open_questions: text(body, "open_questions", 4000, { noCode: true }),
    inputs: await references(agent.labId, body, "inputs", true),
  };
  const run_id = await claimWrite(agent, body);
  return prisma.agentAnalysisSpec.create({ data: { lab_id: agent.labId, run_id, ...fields }, select: { id: true } });
}

async function writeObservationRow(agent: AgentAuth, body: Body) {
  try {
    return await writeObservation(agent, body, claimWrite);
  } catch (e) {
    if (e instanceof ObservationError) throw new AgentWriteError(e.message, e.status);
    throw e;
  }
}

async function writeGeoDraftRow(agent: AgentAuth, body: Body) {
  try {
    return await writeGeoDraft(agent, body, claimWrite);
  } catch (e) {
    if (e instanceof RequestError) throw new AgentWriteError(e.message, e.status);
    throw e;
  }
}

export const AGENT_WRITERS = {
  observations: writeObservationRow,
  geo_drafts: writeGeoDraftRow,
  comments: writeComment,
  tags: writeTag,
  links: writeLink,
  recommendations: writeRecommendation,
  specs: writeSpec,
} as const;

export type AgentWriteKind = keyof typeof AGENT_WRITERS;

export function isAgentWriteKind(kind: string): kind is AgentWriteKind {
  return Object.prototype.hasOwnProperty.call(AGENT_WRITERS, kind);
}
