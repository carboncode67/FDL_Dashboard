import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { KIND_SPECS, kindCanRead, kindOmits, type AgentKind } from "@/lib/agent/kinds";

/**
 * What an agent can read (docs/agent-sandbox-plan.md §3).
 *
 * Table level is an allowlist: a table not listed here is invisible to the
 * agent, so a new table stays out of reach until someone adds it on purpose.
 * Deliberately absent: users, Contacts, WhatsApp contact cards, message
 * templates, reporting subscriptions, equipment loans, every *_Assignments
 * table, geofence events/time sessions (people's movements), site_config,
 * labs, per-user filter tables, Agent_Tokens and Agent_Runs. Contact data is
 * out of reach except the farm name (Farms.Farm_Name).
 *
 * Column level is "everything except": the user asked for all research data
 * to be readable, so within an allowed table every scalar column is returned
 * minus SECRET_COLUMN (credentials) and the table's own `omit` (contact data).
 *
 * Every query is filtered to the token's lab by `scope(labId)` — explicitly,
 * because RLS isn't a boundary while TENANT_ENFORCEMENT=off. Child tables
 * (no lab_id of their own) are scoped through their parent relation.
 */

type Where = Record<string, unknown>;

interface Delegate {
  findMany(args: unknown): Promise<Record<string, unknown>[]>;
  findFirst(args: unknown): Promise<Record<string, unknown> | null>;
}

export interface AgentTable {
  /** Prisma model name, e.g. "FarmExperiment". */
  model: string;
  scope: (labId: number) => Where | Promise<Where>;
  /** Contact/person columns never returned. */
  omit?: string[];
  /** Large columns left out of list responses (still returned by id). */
  listOmit?: string[];
  /** Text columns searched by /api/agent/search. */
  search?: string[];
  /** Column used as a human-readable title in search hits. */
  title?: string;
  /** Rows written by the agent itself — treat as untrusted on read. */
  agentAuthored?: boolean;
}

/** Credentials and secrets — never research data, never readable. */
const SECRET_COLUMN = /token|secret|password|api_?key|^email$|phone|^address$/i;

const lab = (labId: number) => ({ lab_id: labId });
// Shared library tables (Tests, Treatments, Drones, Crops, Methodologies): the
// lab's own rows plus global ones, same rule as migration 070's policy.
const libraryOrLab = (labId: number) => ({ OR: [{ lab_id: labId }, { lab_id: null }] });
const viaFarm = (labId: number) => ({ Farm: { lab_id: labId } });
const experimentScope = (labId: number) => ({
  OR: [{ Farm: { lab_id: labId } }, { Project: { lab_id: labId } }],
});
const viaExperiment = (labId: number) => ({ Experiment: experimentScope(labId) });

const UPLOAD_SEARCH = ["category", "description", "filename"];

export const AGENT_TABLES: Record<string, AgentTable> = {
  projects: { model: "Project", scope: lab, search: ["Project_Name", "Project_Sponsors"], title: "Project_Name" },
  project_farms: { model: "ProjectFarm", scope: (l) => ({ Project: { lab_id: l } }) },
  farms: {
    model: "Farm",
    scope: lab,
    listOmit: ["farm_summary", "interview_transcript"],
    search: ["Farm_Name", "County", "farm_summary", "interview_transcript"],
    title: "Farm_Name",
  },
  fields: { model: "Field", scope: viaFarm, listOmit: ["geometry"], search: ["Name"], title: "Name" },
  dualex: { model: "Dualex", scope: (l) => ({ Field: viaFarm(l) }) },
  experiment_zones: { model: "ExperimentZone", scope: experimentScope, listOmit: ["geometry"], search: ["Zone_Label"], title: "Zone_Label" },
  farm_experiments: {
    model: "FarmExperiment",
    scope: experimentScope,
    search: ["experiment_name", "hypothesis", "experiment_desc", "measurements", "criteria", "lab_description"],
    title: "experiment_name",
  },
  experiment_tests: { model: "ExperimentTest", scope: viaExperiment },
  experiment_treatments: { model: "ExperimentTreatment", scope: viaExperiment },
  experiment_fields: { model: "ExperimentField", scope: viaExperiment },
  experiment_drone_flights: { model: "ExperimentDroneFlight", scope: viaExperiment },
  experiment_treatment_values: {
    model: "ExperimentTreatmentValue",
    // experiment_id has no Prisma relation, so resolve the lab's experiment ids.
    scope: async (l) => {
      const ids = await prisma.farmExperiment.findMany({ where: experimentScope(l), select: { id: true } });
      return { experiment_id: { in: ids.map((e) => e.id) } };
    },
  },
  tests: { model: "Test", scope: libraryOrLab, search: ["Test_Name", "Test_Description", "Methodology"], title: "Test_Name" },
  treatments: { model: "Treatment", scope: libraryOrLab, search: ["Treatment_Name", "Description", "Notes"], title: "Treatment_Name" },
  treatment_field_definitions: { model: "TreatmentFieldDefinition", scope: (l) => ({ Treatment: libraryOrLab(l) }) },
  treatment_protocols: {
    model: "TreatmentProtocol",
    scope: (l) => ({ OR: [{ Project: { lab_id: l } }, { Treatment: { lab_id: l } }] }),
  },
  drones: { model: "Drone", scope: libraryOrLab, search: ["Name", "Description"], title: "Name" },
  crops: { model: "Crop", scope: libraryOrLab, search: ["Crop_Name", "Crop_Type"], title: "Crop_Name" },
  methodologies: { model: "Methodology", scope: libraryOrLab, listOmit: ["body"], search: ["title", "body"], title: "title" },
  data_tables: { model: "DataTable", scope: lab },
  data_table_field_definitions: { model: "DataTableFieldDefinition", scope: (l) => ({ DataTable: lab(l) }) },
  data_table_rows: { model: "DataTableRow", scope: (l) => ({ DataTable: lab(l) }) },
  upload_categories: { model: "UploadCategory", scope: lab },
  category_metrics: { model: "CategoryMetric", scope: (l) => ({ Category: lab(l) }) },
  upload_metric_values: { model: "UploadMetricValue", scope: (l) => ({ Metric: { Category: lab(l) } }) },

  photos: { model: "Photo", scope: lab, search: [...UPLOAD_SEARCH, "note"], title: "filename" },
  recordings: { model: "Recording", scope: lab, search: UPLOAD_SEARCH, title: "filename" },
  notes: { model: "Note", scope: lab, search: ["content", "category", "description"], title: "description" },
  locations: { model: "Location", scope: lab, search: ["name", "category", "description"], title: "name" },
  lab_member_uploads: { model: "LabMemberUpload", scope: lab, search: [...UPLOAD_SEARCH, "content"], title: "filename" },
  videos: { model: "Video", scope: lab, search: [...UPLOAD_SEARCH, "note"], title: "filename" },
  documents: { model: "Document", scope: lab, search: [...UPLOAD_SEARCH, "original_name", "note"], title: "original_name" },

  drone_flight_records: {
    model: "DroneFlightRecord",
    scope: (l) => ({ ExperimentDroneFlight: viaExperiment(l) }),
    omit: ["pilot"],
  },
  drone_flight_polygons: {
    model: "DroneFlightPolygon",
    scope: (l) => ({ FlightRecord: { ExperimentDroneFlight: viaExperiment(l) } }),
  },
  tasks: { model: "Task", scope: lab, search: ["description", "classification"], title: "description" },
  task_upload_links: { model: "TaskUploadLink", scope: (l) => ({ Task: lab(l) }) },
  forms: { model: "Form", scope: lab, search: ["title", "description"], title: "title" },
  form_field_definitions: { model: "FormFieldDefinition", scope: (l) => ({ Form: lab(l) }) },
  form_responses: { model: "FormResponse", scope: (l) => ({ Form: lab(l) }) },
  pipelines: { model: "Pipeline", scope: lab, search: ["name", "description"], title: "name" },
  pipeline_runs: {
    model: "PipelineRun",
    scope: (l) => ({ Pipeline: lab(l) }),
    listOmit: ["prompt", "stdout_log", "stderr_log"],
  },
  pipeline_output_rasters: { model: "PipelineOutputRaster", scope: viaFarm },
  basemaps: { model: "Basemap", scope: viaFarm },
  farm_layers: { model: "FarmLayer", scope: viaFarm, listOmit: ["geojson"], search: ["name"], title: "name" },
  yield_runs: { model: "YieldRun", scope: viaFarm, search: ["display_name", "original_filename"], title: "display_name" },
  context_rasters: { model: "ContextRaster", scope: viaFarm },
  sampling_maps: { model: "SamplingMap", scope: lab, search: ["name", "description"], title: "name" },
  sampling_map_polygons: { model: "SamplingMapPolygon", scope: (l) => ({ SamplingMap: lab(l) }) },
  sampling_points: { model: "SamplingPoint", scope: (l) => ({ SamplingMap: lab(l) }) },
  sampling_point_collections: {
    model: "SamplingPointCollection",
    scope: (l) => ({ SamplingPoint: { SamplingMap: lab(l) } }),
  },
  annotations: { model: "Annotation", scope: (l) => ({ CvatTask: { Project: lab(l) } }), omit: ["annotated_by"] },
  farm_tags: { model: "FarmTag", scope: lab },
  farm_tag_links: { model: "FarmTagLink", scope: viaFarm },

  // Farmer management events synced from OFE (migration 096). Who entered an
  // event is contact data, so those columns are omitted.
  operation_categories: { model: "OperationCategory", scope: lab, title: "name" },
  operation_types: { model: "OperationType", scope: lab, search: ["name"], title: "name" },
  management_events: {
    model: "ManagementEvent",
    scope: viaFarm,
    omit: ["created_by_email", "created_by_name", "entered_on_behalf_of_email"],
    search: ["notes"],
    title: "notes",
  },
  management_event_fields: { model: "ManagementEventField", scope: (l) => ({ Event: viaFarm(l) }) },
  agent_tag_vocabulary: { model: "AgentTagVocabulary", scope: lab },
  agent_comments: { model: "AgentComment", scope: lab, agentAuthored: true },
  agent_tag_links: { model: "AgentTagLink", scope: lab, agentAuthored: true },
  agent_links: { model: "AgentLink", scope: lab, agentAuthored: true },
  agent_recommendations: { model: "AgentRecommendation", scope: lab, agentAuthored: true },
  agent_analysis_specs: { model: "AgentAnalysisSpec", scope: lab, agentAuthored: true },
  agent_observations: {
    model: "AgentObservation",
    scope: lab,
    agentAuthored: true,
    search: ["description", "crop", "extracted_text"],
    title: "description",
  },
};

// ── DMMF-derived column metadata ─────────────────────────────────────────────

interface ColumnInfo {
  name: string;
  type: string;
  isList: boolean;
}

interface ModelInfo {
  delegate: Delegate;
  columns: ColumnInfo[]; // readable scalar columns only
  omit: Record<string, true>; // secret + contact columns, for Prisma `omit`
  listOmit: Record<string, true>;
  hasId: boolean;
  timeColumn: string | null;
}

const TIME_COLUMNS = ["updated_at", "received_at", "submitted_at", "uploaded_at", "ingested_at", "created_at", "createdAt"];

const modelCache = new Map<string, ModelInfo>();

function modelInfo(table: AgentTable): ModelInfo {
  const cached = modelCache.get(table.model);
  if (cached) return cached;

  const dm = Prisma.dmmf.datamodel.models.find((m) => m.name === table.model);
  if (!dm) throw new Error(`Agent registry: unknown Prisma model ${table.model}`);
  const scalars = dm.fields.filter((f) => f.kind === "scalar" || f.kind === "enum");
  const hidden = new Set([...(table.omit ?? []), ...scalars.filter((f) => SECRET_COLUMN.test(f.name)).map((f) => f.name)]);

  const delegateKey = table.model.charAt(0).toLowerCase() + table.model.slice(1);
  const info: ModelInfo = {
    delegate: (prisma as unknown as Record<string, Delegate>)[delegateKey],
    columns: scalars.filter((f) => !hidden.has(f.name)).map((f) => ({ name: f.name, type: f.type, isList: f.isList })),
    omit: Object.fromEntries([...hidden].map((n) => [n, true as const])),
    listOmit: Object.fromEntries([...hidden, ...(table.listOmit ?? [])].map((n) => [n, true as const])),
    hasId: scalars.some((f) => f.name === "id" && f.isId),
    timeColumn: TIME_COLUMNS.find((c) => scalars.some((f) => f.name === c)) ?? null,
  };
  modelCache.set(table.model, info);
  return info;
}

/** A map-bound run's confinement (plan §5.1a): one sampling map and its farm. */
export interface AgentBinding {
  runId: number;
  requestId: number;
  mapId: number;
  farmId: number;
}

// How each table a map-bound agent can read is narrowed to the bound map/farm.
// A table missing here is unreadable while bound — add one deliberately.
const BOUND_WHERE: Record<string, (b: AgentBinding) => Where> = {
  farms: (b) => ({ id: b.farmId }),
  fields: (b) => ({ Farms_id: b.farmId }),
  experiment_zones: (b) => ({ farm_id: b.farmId }),
  farm_experiments: (b) => ({ farm_id: b.farmId }),
  sampling_maps: (b) => ({ id: b.mapId }),
  sampling_map_polygons: (b) => ({ sampling_map_id: b.mapId }),
  sampling_points: (b) => ({ sampling_map_id: b.mapId }),
  sampling_point_collections: (b) => ({ SamplingPoint: { sampling_map_id: b.mapId } }),
  farm_layers: (b) => ({ farm_id: b.farmId }),
  basemaps: (b) => ({ farm_id: b.farmId }),
  context_rasters: (b) => ({ farm_id: b.farmId }),
  yield_runs: (b) => ({ farm_id: b.farmId }),
  pipeline_output_rasters: (b) => ({ farm_id: b.farmId }),
};

/** Extra where-clause for `kind` (+ binding). null = not readable at all. */
function kindWhere(slug: string, kind: AgentKind | undefined, binding: AgentBinding | null | undefined): Where | null {
  if (!kind || !KIND_SPECS[kind].mapBound) return {};
  if (!binding) return null; // map-bound kinds read nothing until a request is claimed
  const f = BOUND_WHERE[slug];
  return f ? f(binding) : null;
}

function omitFor(base: Record<string, true>, slug: string, kind?: AgentKind): Record<string, true> {
  const extra = kind ? kindOmits(kind, slug) : [];
  return extra.length ? { ...base, ...Object.fromEntries(extra.map((c) => [c, true as const])) } : base;
}

/** The registry entry, or null if unknown — or not readable by `kind` when given. */
export function getAgentTable(slug: string, kind?: AgentKind): AgentTable | null {
  if (!Object.prototype.hasOwnProperty.call(AGENT_TABLES, slug)) return null;
  if (kind && !kindCanRead(kind, slug)) return null;
  return AGENT_TABLES[slug];
}

/** Tables + readable columns, for the agent's schema discovery. */
export function describeAgentTables(kind: AgentKind) {
  return Object.entries(AGENT_TABLES).filter(([slug]) => kindCanRead(kind, slug)).map(([slug, t]) => {
    const info = modelInfo(t);
    const hidden = new Set(kindOmits(kind, slug));
    return {
      table: slug,
      columns: info.columns.filter((c) => !hidden.has(c.name)).map((c) => ({ name: c.name, type: c.isList ? `${c.type}[]` : c.type })),
      by_id: info.hasId,
      list_omits: t.listOmit ?? [],
      since_column: info.timeColumn,
      searchable: t.search ?? [],
      agent_authored: !!t.agentAuthored,
    };
  });
}

// ── Queries ─────────────────────────────────────────────────────────────────

export class AgentQueryError extends Error {}

/**
 * Equality filters from query params: `?farm_id=5`, `?status=2,3`, `?since=ISO`.
 * Only readable scalar columns of type Int / String / Boolean are filterable.
 */
function filtersFromParams(info: ModelInfo, params: URLSearchParams): Where {
  const where: Where = {};
  for (const [key, raw] of params) {
    if (key === "limit" || key === "offset" || key === "since") continue;
    const col = info.columns.find((c) => c.name === key);
    if (!col || col.isList) throw new AgentQueryError(`Not a filterable column: ${key}`);
    const values = raw.split(",").map((v) => v.trim()).filter(Boolean);
    let parsed: unknown[];
    if (col.type === "Int") {
      parsed = values.map((v) => Number.parseInt(v, 10));
      if (parsed.some((v) => Number.isNaN(v))) throw new AgentQueryError(`${key} must be an integer`);
    } else if (col.type === "Boolean") {
      parsed = values.map((v) => v === "true");
    } else if (col.type === "String") {
      parsed = values;
    } else {
      throw new AgentQueryError(`Not a filterable column type: ${key} (${col.type})`);
    }
    where[key] = parsed.length === 1 ? parsed[0] : { in: parsed };
  }
  const since = params.get("since");
  if (since) {
    if (!info.timeColumn) throw new AgentQueryError("This table has no timestamp column for `since`");
    const d = new Date(since);
    if (Number.isNaN(d.getTime())) throw new AgentQueryError("`since` must be an ISO timestamp");
    where[info.timeColumn] = { gte: d };
  }
  return where;
}

export const MAX_LIST_LIMIT = 500;

export async function listAgentRows(
  slug: string,
  labId: number,
  params: URLSearchParams,
  kind: AgentKind,
  binding?: AgentBinding | null,
) {
  const table = getAgentTable(slug, kind);
  const bound = kindWhere(slug, kind, binding);
  if (!table || !bound) throw new AgentQueryError(`Unknown table: ${slug}`);
  const info = modelInfo(table);
  const limit = Math.min(Math.max(Number(params.get("limit") ?? 50) || 50, 1), MAX_LIST_LIMIT);
  const offset = Math.max(Number(params.get("offset") ?? 0) || 0, 0);

  const rows = await info.delegate.findMany({
    where: { AND: [await table.scope(labId), filtersFromParams(info, params), bound] },
    omit: omitFor(info.listOmit, slug, kind),
    take: limit,
    skip: offset,
    ...(info.hasId ? { orderBy: { id: "desc" } } : {}),
  });
  return { table: slug, agent_authored: !!table.agentAuthored, limit, offset, rows: rows.map(jsonSafe) };
}

/** One row by id within the lab, or null. Also the existence check for writes. */
export async function getAgentRow(
  slug: string,
  labId: number,
  id: number,
  kind?: AgentKind,
  binding?: AgentBinding | null,
) {
  const table = getAgentTable(slug, kind);
  const bound = kindWhere(slug, kind, binding);
  if (!table || !bound) throw new AgentQueryError(`Unknown table: ${slug}`);
  const info = modelInfo(table);
  if (!info.hasId) throw new AgentQueryError(`${slug} has a composite key; list it with filters instead`);
  const row = await info.delegate.findFirst({
    where: { AND: [await table.scope(labId), { id }, bound] },
    omit: omitFor(info.omit, slug, kind),
  });
  return row ? jsonSafe(row) : null;
}

export function agentTableHasId(slug: string): boolean {
  const table = getAgentTable(slug);
  return !!table && modelInfo(table).hasId;
}

const SNIPPET_RADIUS = 80;
const SEARCH_PER_TABLE = 10;

export async function searchAgentRows(
  q: string,
  labId: number,
  tables: string[] | undefined,
  kind: AgentKind,
  binding?: AgentBinding | null,
) {
  const query = q.trim();
  const slugs = (tables?.length ? tables : Object.keys(AGENT_TABLES)).filter(
    (s) => getAgentTable(s, kind)?.search?.length && kindWhere(s, kind, binding),
  );
  const groups = await Promise.all(
    slugs.map(async (slug) => {
      const table = AGENT_TABLES[slug];
      const info = modelInfo(table);
      const hidden = new Set(kindOmits(kind, slug));
      const fields = table.search!.filter((f) => !hidden.has(f) && info.columns.some((c) => c.name === f));
      if (!fields.length) return [];
      const rows = await info.delegate.findMany({
        where: {
          AND: [
            await table.scope(labId),
            kindWhere(slug, kind, binding)!,
            { OR: fields.map((f) => ({ [f]: { contains: query, mode: "insensitive" } })) },
          ],
        },
        select: Object.fromEntries(["id", ...fields].map((f) => [f, true])),
        take: SEARCH_PER_TABLE,
      });
      return rows.map((row) => {
        const matched = fields.find((f) => String(row[f] ?? "").toLowerCase().includes(query.toLowerCase())) ?? fields[0];
        const value = String(row[matched] ?? "");
        const idx = value.toLowerCase().indexOf(query.toLowerCase());
        const start = Math.max(0, idx - SNIPPET_RADIUS);
        return {
          table: slug,
          id: row.id as number,
          title: table.title ? (row[table.title] as string | null) : null,
          matched_field: matched,
          snippet: value.slice(start, idx + query.length + SNIPPET_RADIUS).replace(/\s+/g, " "),
          agent_authored: !!table.agentAuthored,
        };
      });
    }),
  );
  return groups.flat();
}

/** BigInt (Basemap.bytes, YieldRun.bytes) isn't JSON-serializable. */
function jsonSafe(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = typeof v === "bigint" ? Number(v) : v;
  return out;
}
