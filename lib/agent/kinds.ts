/**
 * Agent kinds (docs/cartographer-agent-plan.md §5.1). One platform, several
 * agents; a token's agent_kind (migration 098) decides what its agent can do.
 * Everything here is enforced server-side: withAgent() checks the feature a
 * route provides, the registry filters tables, the write route checks the write
 * kind. The runner and broker can't widen any of it.
 */

export const AGENT_KINDS = ["sleuth", "cartographer"] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];

/** What a /api/agent/* route provides. `runs` and `write` need the token's write scope. */
export type AgentFeature =
  | "tables" | "read" | "search" | "semantic" | "files" | "observations" | "runs" | "write"
  | "requests" // claim / answer interactive requests
  | "compute"; // deterministic geometry tools (lib/geo-tools.ts)

export const WRITE_FEATURES: ReadonlySet<AgentFeature> = new Set(["runs", "write", "requests"]);

/** Features that, for a map-bound kind, need a run bound to a claimed request's map. */
export const BOUND_FEATURES: ReadonlySet<AgentFeature> = new Set(["read", "search", "compute", "write"]);

interface KindSpec {
  label: string;
  description: string;
  features: ReadonlySet<AgentFeature>;
  /** /api/agent/write/<kind> values this agent may use. */
  writeKinds: readonly string[];
  /** Readable registry tables: every one, or an explicit allowlist. */
  tables: "all" | ReadonlySet<string>;
  /** Interactive kinds: each run claims one request and may only touch that
   *  request's sampling map and its farm (plan §5.1a). */
  mapBound: boolean;
  /** Extra columns hidden from this kind (e.g. raw interview text on farms). */
  omitColumns?: Record<string, readonly string[]>;
}

// Spatial context a map-working agent needs; no uploads, notes, transcripts,
// forms or agent output from other agents.
const CARTOGRAPHER_TABLES = new Set([
  "farms", "fields", "experiment_zones", "farm_experiments",
  "sampling_maps", "sampling_map_polygons", "sampling_points", "sampling_point_collections",
  "farm_layers", "basemaps", "context_rasters", "yield_runs", "pipeline_output_rasters",
]);

export const KIND_SPECS: Record<AgentKind, KindSpec> = {
  sleuth: {
    label: "Data Sleuth",
    description: "Nightly batch: observes uploads, finds patterns, recommends. Never changes research data.",
    features: new Set(["tables", "read", "search", "semantic", "files", "observations", "runs", "write"]),
    writeKinds: ["observations", "comments", "tags", "links", "recommendations", "specs"],
    tables: "all",
    mapBound: false,
  },
  cartographer: {
    label: "Cartographer",
    description: "Interactive map work on one sampling map at a time; writes drafts a person applies.",
    features: new Set(["tables", "read", "search", "runs", "requests", "compute", "write"]),
    writeKinds: ["geo_drafts"],
    tables: CARTOGRAPHER_TABLES,
    mapBound: true,
    omitColumns: { farms: ["farm_summary", "interview_transcript", "address"] },
  },
};

export function isAgentKind(v: unknown): v is AgentKind {
  return typeof v === "string" && (AGENT_KINDS as readonly string[]).includes(v);
}

export function kindHasFeature(kind: AgentKind, feature: AgentFeature): boolean {
  return KIND_SPECS[kind].features.has(feature);
}

export function kindCanRead(kind: AgentKind, table: string): boolean {
  const t = KIND_SPECS[kind].tables;
  return t === "all" || t.has(table);
}

export function kindOmits(kind: AgentKind, table: string): readonly string[] {
  return KIND_SPECS[kind].omitColumns?.[table] ?? [];
}

export function kindCanWrite(kind: AgentKind, writeKind: string): boolean {
  return KIND_SPECS[kind].writeKinds.includes(writeKind);
}
