// US Drought Monitor categories as shown on the farm map's drought timeline.
// Client-safe — shared by the server-side timeline builder
// (lib/context-timeline.ts) and the timeline component.

export type UsdmCategory = "none" | "D0" | "D1" | "D2" | "D3" | "D4";

export const USDM_CATEGORIES: UsdmCategory[] = ["none", "D0", "D1", "D2", "D3", "D4"];

// D0–D4 are the official USDM map colours; "none" is green so a dry spell
// reads against a normal background.
export const USDM_COLORS: Record<UsdmCategory, string> = {
  none: "#7cc47f",
  D0: "#ffff00",
  D1: "#fcd37f",
  D2: "#ffaa00",
  D3: "#e60000",
  D4: "#730000",
};

// GeoDaRT documents its USDM rasters as 0 = no drought, 1 = D0 … 5 = D4, but
// as of API 1.06092026 it writes the UNL shapefile's numeric DM field (0 = D0
// … 4 = D4) straight through, so D0 lands on the same 0 as its "no drought"
// fill and every other category is one lower than documented. Rasters in that
// "legacy" encoding can't distinguish D0 from no drought at all.
// Set to the date the GeoDaRT fix is deployed: USDM rasters fetched on/after
// it are decoded as documented, older ones as legacy.
export const USDM_ENCODING_FIXED_AT: string | null = null;

export type UsdmEncoding = "legacy" | "documented";

export function usdmEncodingFor(fetchedAt: Date): UsdmEncoding {
  return USDM_ENCODING_FIXED_AT != null && fetchedAt >= new Date(USDM_ENCODING_FIXED_AT) ? "documented" : "legacy";
}

/** Pixel value → category, or null for nodata / unknown values. */
export function decodeUsdm(value: number, encoding: UsdmEncoding): UsdmCategory | null {
  if (encoding === "documented") return value >= 0 && value <= 5 ? USDM_CATEGORIES[value] : null;
  // legacy: 0 = no drought or D0 (reported as none), 1–4 = D1–D4
  if (value === 0) return "none";
  return value >= 1 && value <= 4 ? USDM_CATEGORIES[value + 1] : null;
}
