import { ALL_PRODUCTS, isProductCode, type ProductCode } from "@/lib/geodart";
import type { PlanArgs } from "@/lib/context-coverage";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Update / Expand request body → plan args, shared by the session route, its
 * dry-run preview and the Data API twin (OFE). Returns an error string when invalid.
 * Expand's products default to every product (anything already covered is
 * skipped by the planner anyway).
 */
export function parseExtensionBody(body: Record<string, unknown>): PlanArgs | string {
  if (body.mode === "update") return { mode: "update" };
  if (body.mode !== "expand") return "mode must be update or expand";
  const start = body.start_date;
  const end = body.end_date;
  if (typeof start !== "string" || typeof end !== "string" || !DATE.test(start) || !DATE.test(end)) {
    return "Expand needs start_date and end_date as YYYY-MM-DD";
  }
  if (start > end) return "start_date must be on or before end_date";
  const raw = Array.isArray(body.products) ? body.products : null;
  const products: ProductCode[] = raw
    ? (raw.filter((p): p is string => typeof p === "string").filter(isProductCode) as ProductCode[])
    : [];
  if (raw && !products.length) return "No valid products selected";
  return { mode: "expand", startDate: start, endDate: end, products: products.length ? products : [...ALL_PRODUCTS] };
}
