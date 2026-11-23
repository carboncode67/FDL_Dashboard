/**
 * Pipeline request vocabulary (docs/pipeline-requests-plan.md). Client-safe:
 * the request form and the server validator both use it. A request may only
 * pick from these lists; adding a kind is a developer change here and on
 * PipelineProcessor (its op registry), never something a request can do.
 */
import { DATA_PRODUCTS } from "@/lib/data-products";

export const INPUT_KINDS = {
  upload: { label: "Upload (photo / note / recording / lab upload)", matchable: true },
  document: { label: "Document (matched to a Data Table template)", matchable: true },
  test_data_rows: { label: "Test data rows (a Data Table)", matchable: true },
  basemap: { label: "Drone ortho / basemap", matchable: false },
  drone_flight: { label: "Drone flight", matchable: false },
  yield_card: { label: "Yield monitor card", matchable: true },
  farm_fields: { label: "The farm's field boundaries", matchable: false },
  experiment_zones: { label: "The experiment's zones", matchable: false },
  context_rasters: { label: "Farm context rasters (Sentinel-2, elevation, soils)", matchable: false },
} as const;
export type InputKind = keyof typeof INPUT_KINDS;

export const OUTPUT_KINDS = {
  raster_tiles: "Map raster (tiled, on the farm map)",
  raster_file: "Raster file (GeoTIFF)",
  vector_layer: "Map layer (points / polygons)",
  table: "Table (CSV)",
  document: "Document / report",
} as const;
export type OutputKind = keyof typeof OUTPUT_KINDS;

export const PARAM_TYPES = ["number", "integer", "text", "boolean", "choice"] as const;
export type ParamType = (typeof PARAM_TYPES)[number];

/** Upload tables an `upload` input can match on (same names as Pipelines.match_table). */
export const MATCH_TABLES = ["photos", "notes", "recordings", "lab-member-uploads", "documents"] as const;

export const REQUEST_STATUSES = ["requested", "accepted", "declined", "in_development", "testing", "live", "retired"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  requested: "Requested",
  accepted: "Accepted",
  declined: "Declined",
  in_development: "In development",
  testing: "Testing",
  live: "Live",
  retired: "Retired",
};

export { DATA_PRODUCTS };

export type RequestInput = {
  name: string;
  kind: InputKind;
  trigger: "manual" | "match";
  match?: { table?: string; category?: string; project_id?: number; data_table_id?: number };
  data_product?: string;
  note?: string;
};
export type RequestOutput = { name: string; kind: OutputKind; note?: string };
export type RequestParam = {
  name: string; type: ParamType; default?: string | number | boolean | null;
  min?: number; max?: number; choices?: string[]; help?: string;
};
export type SampleRef = { kind: "basemap" | "document"; id: number; label?: string };

export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
export const ATTACHMENTS_PER_REQUEST = 10;
