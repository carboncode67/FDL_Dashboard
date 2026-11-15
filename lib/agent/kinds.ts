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
export type AgentFeature = "tables" | "read" | "search" | "semantic" | "files" | "observations" | "runs" | "write";

export const WRITE_FEATURES: ReadonlySet<AgentFeature> = new Set(["runs", "write"]);

interface KindSpec {
  label: string;
  description: string;
  features: ReadonlySet<AgentFeature>;
  /** /api/agent/write/<kind> values this agent may use. */
  writeKinds: readonly string[];
  /** Readable registry tables: every one, or an explicit allowlist. */
  tables: "all" | ReadonlySet<string>;
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
  },
  cartographer: {
    label: "Cartographer",
    description: "Interactive map work on one sampling map at a time; writes drafts a person applies.",
    // geo_drafts + request claiming arrive in C2 (plan §5.2–5.3).
    features: new Set(["tables", "read", "search", "runs"]),
    writeKinds: [],
    tables: CARTOGRAPHER_TABLES,
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

export function kindCanWrite(kind: AgentKind, writeKind: string): boolean {
  return KIND_SPECS[kind].writeKinds.includes(writeKind);
}
