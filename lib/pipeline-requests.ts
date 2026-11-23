import fs from "fs";
import path from "path";
import crypto from "crypto";
import yaml from "js-yaml";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { isAdmin, type Role } from "@/lib/roles";
import { getEffectiveScope, scopeIncludesFarm } from "@/lib/get-user-filters";
import {
  ATTACHMENTS_PER_REQUEST, ATTACHMENT_MAX_BYTES, DATA_PRODUCTS, INPUT_KINDS, MATCH_TABLES, OUTPUT_KINDS, PARAM_TYPES,
  REQUEST_STATUSES, type RequestInput, type RequestOutput, type RequestParam, type RequestStatus, type SampleRef,
} from "@/lib/pipeline-kinds";

// Pipeline requests (migration 105, docs/pipeline-requests-plan.md, phase 1).
// Anyone with a login describes a workflow; the developer downloads the
// skeleton pipeline.yaml and implements it in PipelineProcessor. Nothing in
// a request is executed: attachments are stored and served back as files.

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";
const ATTACH_ROOT = path.resolve(DATA_DIR, "pipeline-requests");

export class RequestInputError extends Error {}

const NAME_RE = /^[a-z][a-z0-9_]{0,39}$/;

function str(v: unknown, field: string, max: number, required = true): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (required && !s) throw new RequestInputError(`${field} is required`);
  if (s.length > max) throw new RequestInputError(`${field} is too long (${max} characters max)`);
  return s;
}

function optStr(v: unknown, field: string, max: number): string | undefined {
  const s = str(v, field, max, false);
  return s || undefined;
}

function optInt(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function list(v: unknown, field: string, min: number, max: number): Record<string, unknown>[] {
  const a = Array.isArray(v) ? v : [];
  if (a.length < min) throw new RequestInputError(`Add at least ${min} ${field}`);
  if (a.length > max) throw new RequestInputError(`At most ${max} ${field}`);
  return a.map((x) => (x && typeof x === "object" ? x : {}) as Record<string, unknown>);
}

function uniqueNames(items: { name: string }[], what: string) {
  const seen = new Set<string>();
  for (const i of items) {
    if (!NAME_RE.test(i.name)) {
      throw new RequestInputError(`${what} name "${i.name}" must start with a letter and use only a-z, 0-9 and _ (40 max)`);
    }
    if (seen.has(i.name)) throw new RequestInputError(`Two ${what}s are called "${i.name}"`);
    seen.add(i.name);
  }
}

export type RequestSpec = {
  name: string; description: string;
  inputs: RequestInput[]; outputs: RequestOutput[]; params: RequestParam[]; sample_data: SampleRef[];
};

/** Checks and normalises a request body against the fixed vocabulary. */
export function parseSpec(body: Record<string, unknown>): Omit<RequestSpec, "sample_data"> & { sample_data: SampleRef[] } {
  const name = str(body.name, "Name", 120);
  const description = str(body.description, "Description", 10_000);

  const inputs: RequestInput[] = list(body.inputs, "inputs", 1, 10).map((o) => {
    const kind = String(o.kind ?? "") as RequestInput["kind"];
    if (!(kind in INPUT_KINDS)) throw new RequestInputError(`Unknown input kind "${o.kind}"`);
    const trigger = o.trigger === "match" ? "match" : "manual";
    if (trigger === "match" && !INPUT_KINDS[kind].matchable) {
      throw new RequestInputError(`${INPUT_KINDS[kind].label} can't be matched automatically; use "manual"`);
    }
    const input: RequestInput = { name: str(o.name, "Input name", 40), kind, trigger };
    if (trigger === "match") {
      const m = (o.match && typeof o.match === "object" ? o.match : {}) as Record<string, unknown>;
      const table = optStr(m.table, "Match table", 40);
      if (table && !(MATCH_TABLES as readonly string[]).includes(table)) throw new RequestInputError(`Unknown upload table "${table}"`);
      input.match = {
        ...(table ? { table } : {}),
        ...(optStr(m.category, "Match category", 100) ? { category: optStr(m.category, "Match category", 100) } : {}),
        ...(optInt(m.project_id) ? { project_id: optInt(m.project_id) } : {}),
        ...(optInt(m.data_table_id) ? { data_table_id: optInt(m.data_table_id) } : {}),
      };
    }
    const dp = optStr(o.data_product, "Data product", 60);
    if (dp) {
      if (!(DATA_PRODUCTS as readonly string[]).includes(dp)) throw new RequestInputError(`Unknown data product "${dp}"`);
      input.data_product = dp;
    }
    const note = optStr(o.note, "Input note", 500);
    if (note) input.note = note;
    return input;
  });
  uniqueNames(inputs, "input");

  const outputs: RequestOutput[] = list(body.outputs, "outputs", 1, 10).map((o) => {
    const kind = String(o.kind ?? "") as RequestOutput["kind"];
    if (!(kind in OUTPUT_KINDS)) throw new RequestInputError(`Unknown output kind "${o.kind}"`);
    const out: RequestOutput = { name: str(o.name, "Output name", 40), kind };
    const note = optStr(o.note, "Output note", 500);
    if (note) out.note = note;
    return out;
  });
  uniqueNames(outputs, "output");

  const params: RequestParam[] = list(body.params, "settings", 0, 20).map((o) => {
    const type = String(o.type ?? "") as RequestParam["type"];
    if (!(PARAM_TYPES as readonly string[]).includes(type)) throw new RequestInputError(`Unknown setting type "${o.type}"`);
    const p: RequestParam = { name: str(o.name, "Setting name", 40), type };
    const num = (v: unknown) => (v === "" || v == null ? undefined : Number.isFinite(Number(v)) ? Number(v) : NaN);
    if (type === "number" || type === "integer") {
      for (const k of ["min", "max"] as const) {
        const n = num(o[k]);
        if (Number.isNaN(n)) throw new RequestInputError(`Setting "${p.name}": ${k} must be a number`);
        if (n !== undefined) p[k] = n;
      }
      const d = num(o.default);
      if (Number.isNaN(d)) throw new RequestInputError(`Setting "${p.name}": default must be a number`);
      if (d !== undefined) p.default = type === "integer" ? Math.round(d) : d;
    } else if (type === "boolean") {
      if (o.default !== undefined && o.default !== "") p.default = o.default === true || o.default === "true";
    } else if (type === "choice") {
      const choices = (Array.isArray(o.choices) ? o.choices : String(o.choices ?? "").split(","))
        .map((c) => String(c).trim()).filter(Boolean).slice(0, 30);
      if (choices.length < 2) throw new RequestInputError(`Setting "${p.name}": give at least two choices`);
      p.choices = choices;
      const d = optStr(o.default, "Default", 100);
      if (d && !choices.includes(d)) throw new RequestInputError(`Setting "${p.name}": default must be one of the choices`);
      if (d) p.default = d;
    } else {
      const d = optStr(o.default, "Default", 200);
      if (d) p.default = d;
    }
    const help = optStr(o.help, "Setting help", 300);
    if (help) p.help = help;
    return p;
  });
  uniqueNames(params, "setting");

  const sample_data: SampleRef[] = list(body.sample_data, "sample records", 0, 20).map((o) => {
    const kind = o.kind === "basemap" || o.kind === "document" ? o.kind : null;
    const id = optInt(o.id);
    if (!kind || !id) throw new RequestInputError("Sample data must be a basemap or document id");
    return { kind, id };
  });

  return { name, description, inputs, outputs, params, sample_data };
}

/** Fills in sample labels and drops any the user can't see (other lab via RLS, or out of scope). */
export async function resolveSamples(refs: SampleRef[], session: Session): Promise<SampleRef[]> {
  if (refs.length === 0) return [];
  const scope = await getEffectiveScope(session.user.id ?? null, session.user.category);
  const bIds = refs.filter((r) => r.kind === "basemap").map((r) => r.id);
  const dIds = refs.filter((r) => r.kind === "document").map((r) => r.id);
  const [basemaps, docs] = await Promise.all([
    bIds.length ? prisma.basemap.findMany({ where: { id: { in: bIds } }, select: { id: true, farm_id: true, display_name: true, original_filename: true } }) : [],
    dIds.length ? prisma.document.findMany({ where: { id: { in: dIds } }, select: { id: true, farm_id: true, original_name: true } }) : [],
  ]);
  const out: SampleRef[] = [];
  for (const r of refs) {
    if (r.kind === "basemap") {
      const b = basemaps.find((x) => x.id === r.id);
      if (b && scopeIncludesFarm(scope, b.farm_id)) out.push({ kind: "basemap", id: b.id, label: b.display_name || b.original_filename });
    } else {
      const d = docs.find((x) => x.id === r.id);
      if (d && (d.farm_id == null ? !scope.hardScoped : scopeIncludesFarm(scope, d.farm_id))) {
        out.push({ kind: "document", id: d.id, label: d.original_name ?? `Document ${d.id}` });
      }
    }
  }
  return out;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "") || "pipeline";
}

export async function createRequest(spec: RequestSpec, labId: number, userId: string | null) {
  // The key carries the row id, so create first and then set it.
  const row = await prisma.pipelineRequest.create({
    data: {
      lab_id: labId,
      pipeline_key: `pending-${crypto.randomUUID()}`,
      name: spec.name, description: spec.description,
      inputs: spec.inputs, outputs: spec.outputs, params: spec.params, sample_data: spec.sample_data,
      requested_by_id: userId,
    },
  });
  return prisma.pipelineRequest.update({
    where: { id: row.id },
    data: { pipeline_key: `${String(row.id).padStart(4, "0")}-${slug(spec.name)}` },
  });
}

/** Requester while still "requested", or an admin. */
export function canEditRequest(session: Session, req: { requested_by_id: string | null; status: string }): boolean {
  if (isAdmin((session.user.role ?? "viewer") as Role)) return true;
  return req.status === "requested" && !!session.user.id && req.requested_by_id === session.user.id;
}

export function parseStatus(v: unknown): RequestStatus {
  if (typeof v === "string" && (REQUEST_STATUSES as readonly string[]).includes(v)) return v as RequestStatus;
  throw new RequestInputError("Unknown status");
}

// ── Skeleton pipeline.yaml ───────────────────────────────────────────────────

type RequestRow = {
  id: number; pipeline_key: string; name: string; description: string; status: string;
  inputs: unknown; outputs: unknown; params: unknown; sample_data: unknown; created_at: Date;
  requested_by_id: string | null;
  RequestedBy?: { name: string | null; email: string } | null;
  Attachments?: { original_name: string }[];
};

// JSONB doesn't keep key order; put the YAML's keys back in a readable one.
function ordered(items: unknown, keys: string[]): Record<string, unknown>[] {
  return (Array.isArray(items) ? items : []).map((o) => {
    const src = (o ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of keys) if (src[k] !== undefined) out[k] = src[k];
    for (const k of Object.keys(src)) if (!(k in out)) out[k] = src[k];
    return out;
  });
}

/** The request as the pipeline.yaml contract, with `steps: []` for the developer to fill in. */
export function skeletonYaml(r: RequestRow): string {
  const doc = {
    key: r.pipeline_key,
    version: 1,
    name: r.name,
    status: r.status,
    requested_by: r.RequestedBy?.name || r.RequestedBy?.email || r.requested_by_id || null,
    requested_at: r.created_at.toISOString().slice(0, 10),
    description: r.description,
    inputs: ordered(r.inputs, ["name", "kind", "trigger", "match", "data_product", "note"]).map((i) =>
      i.match ? { ...i, match: ordered([i.match], ["table", "category", "project_id", "data_table_id"])[0] } : i),
    outputs: ordered(r.outputs, ["name", "kind", "note"]),
    params: ordered(r.params, ["name", "type", "default", "min", "max", "choices", "help"]),
    sample_data: ordered(r.sample_data, ["kind", "id", "label"]),
    attachments: (r.Attachments ?? []).map((a) => a.original_name),
    steps: [],
  };
  const header = [
    `# ${r.pipeline_key}/pipeline.yaml — skeleton from pipeline request #${r.id}.`,
    "# Generated by the FDL Dashboard (docs/pipeline-requests-plan.md). The request",
    "# describes WHAT is wanted; `steps` is for the developer to fill in from reviewed",
    "# ops in PipelineProcessor. Attachments are reference material only: read them,",
    "# never run them as-is.",
    "",
  ].join("\n");
  return header + yaml.dump(doc, { lineWidth: 100, noRefs: true, sortKeys: false });
}

// ── Attachments ──────────────────────────────────────────────────────────────

function requestDir(requestId: number): string {
  return path.join(ATTACH_ROOT, String(requestId));
}

export function attachmentPath(requestId: number, storedName: string): string {
  const p = path.join(requestDir(requestId), path.basename(storedName));
  if (!p.startsWith(ATTACH_ROOT + path.sep)) throw new RequestInputError("Bad attachment path");
  return p;
}

export async function addAttachment(req: { id: number; lab_id: number }, file: File, userId: string | null) {
  const requestId = req.id;
  if (file.size === 0) throw new RequestInputError("Empty file");
  if (file.size > ATTACHMENT_MAX_BYTES) throw new RequestInputError("File too large (25 MB max)");
  const count = await prisma.pipelineRequestAttachment.count({ where: { request_id: requestId } });
  if (count >= ATTACHMENTS_PER_REQUEST) throw new RequestInputError(`At most ${ATTACHMENTS_PER_REQUEST} attachments`);
  const original = path.basename(file.name || "file").slice(0, 200) || "file";
  const safe = original.replace(/[^\w.-]+/g, "_").slice(0, 120);
  const stored = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${safe}`;
  const dir = requestDir(requestId);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(attachmentPath(requestId, stored), Buffer.from(await file.arrayBuffer()));
  return prisma.pipelineRequestAttachment.create({
    data: { lab_id: req.lab_id, request_id: requestId, original_name: original, stored_name: stored, bytes: BigInt(file.size), uploaded_by_id: userId },
  });
}

export async function removeAttachment(requestId: number, attachmentId: number): Promise<boolean> {
  const a = await prisma.pipelineRequestAttachment.findFirst({ where: { id: attachmentId, request_id: requestId } });
  if (!a) return false;
  await prisma.pipelineRequestAttachment.delete({ where: { id: a.id } });
  await fs.promises.unlink(attachmentPath(requestId, a.stored_name)).catch(() => {});
  return true;
}

export async function removeRequestFiles(requestId: number) {
  await fs.promises.rm(requestDir(requestId), { recursive: true, force: true }).catch(() => {});
}

/** Options for the request form: projects, Data Tables, and sample-data choices in the user's scope. */
export async function loadRequestFormOptions(session: Session) {
  const scope = await getEffectiveScope(session.user.id ?? null, session.user.category);
  const farmWhere = scope.hardScoped ? { farm_id: { in: scope.accessFarmIds } } : {};
  const [projects, dataTables, basemaps, documents] = await Promise.all([
    prisma.project.findMany({ select: { id: true, Project_Name: true }, orderBy: { Project_Name: "asc" } }),
    prisma.dataTable.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.basemap.findMany({
      where: { tiling_status: "ready", ...farmWhere },
      select: { id: true, display_name: true, original_filename: true, Farm: { select: { Farm_Name: true } } },
      orderBy: { created_at: "desc" }, take: 100,
    }),
    prisma.document.findMany({
      where: farmWhere,
      select: { id: true, original_name: true, filename: true, Farm: { select: { Farm_Name: true } } },
      orderBy: { id: "desc" }, take: 200,
    }),
  ]);
  return {
    projects: projects.map((p) => ({ id: p.id, name: p.Project_Name ?? `Project ${p.id}` })),
    dataTables: dataTables.map((t) => ({ id: t.id, name: t.name })),
    basemaps: basemaps.map((b) => ({ id: b.id, label: `${b.display_name || b.original_filename}${b.Farm?.Farm_Name ? ` (${b.Farm.Farm_Name})` : ""}` })),
    documents: documents.map((d) => ({ id: d.id, label: `${d.original_name || d.filename}${d.Farm?.Farm_Name ? ` (${d.Farm.Farm_Name})` : ""}` })),
  };
}
