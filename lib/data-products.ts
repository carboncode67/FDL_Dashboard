/**
 * What kind of processable data an upload is — the agent's observe pass picks
 * one (Agent_Observations.data_product, migration 102). "none" means it isn't
 * data a processing tool would take (a crop photo, a chat note).
 *
 * Client-safe (no server imports): the Data Sorting UI uses the labels.
 * Mirrored in Client/agents/shared/tools.py DATA_PRODUCTS — keep them in step.
 */
export const DATA_PRODUCTS = [
  "none",
  "soil_lab_report",
  "plant_tissue_report",
  "forage_quality_report",
  "manure_or_nutrient_analysis",
  "yield_data",
  "scale_tickets",
  "as_applied_or_planting_data",
  "sensor_or_weather_log",
  "field_measurements",
  "spatial_data",
  "imagery",
  "other_tabular",
  "other_report",
] as const;
export type DataProduct = (typeof DATA_PRODUCTS)[number];

export const DATA_PRODUCT_LABELS: Record<DataProduct, string> = {
  none: "Not processable data",
  soil_lab_report: "Soil lab report",
  plant_tissue_report: "Plant tissue report",
  forage_quality_report: "Forage quality report",
  manure_or_nutrient_analysis: "Manure / nutrient analysis",
  yield_data: "Yield data",
  scale_tickets: "Scale tickets / weigh slips",
  as_applied_or_planting_data: "As-applied / planting data",
  sensor_or_weather_log: "Sensor or weather log",
  field_measurements: "Field measurements",
  spatial_data: "Spatial data",
  imagery: "Imagery dataset",
  other_tabular: "Other tabular data",
  other_report: "Other report",
};

export function isDataProduct(v: unknown): v is DataProduct {
  return typeof v === "string" && (DATA_PRODUCTS as readonly string[]).includes(v);
}

export function dataProductLabel(v: string): string {
  return isDataProduct(v) ? DATA_PRODUCT_LABELS[v] : v;
}
