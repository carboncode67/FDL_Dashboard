/**
 * What spatial context a farm already has, and what an Update / Expand
 * request still needs to fetch (docs/context-update-and-farm-timeline-plan.md §1).
 *
 * Coverage is derived from Context_Fetch_Jobs, so it needs no table of its own:
 *  - static products (soil, terrain) are covered once any finished job got an
 *    ok result for them;
 *  - time-varying products (drought, Sentinel-2) are covered over the merged
 *    date intervals of finished jobs with an ok result. A job's interval ends
 *    at min(end_date, submitted − publication lag), so data published after
 *    the pull (USDM is released ~2 days after its Tuesday valid date, S2 needs
 *    a few days of processing) is requested again by the next Update.
 *
 * Only jobs whose AOI still contains the farm's current field/zone extent
 * count. If a field has been drawn outside it since, `aoiChanged` is set and
 * the card offers a fresh pull instead of Update/Expand.
 *
 * Update/Expand reuse the newest counted job's AOI ring and buffer, so new
 * rasters line up exactly with the old ones.
 */
import { prisma } from "@/lib/prisma";
import { PRODUCTS, ALL_PRODUCTS, type ProductCode } from "@/lib/geodart";
import { geojsonBounds, unionBounds, type Bounds } from "@/lib/geo";
import type { ContextCoverageDTO, ContextPlanGroup, ContextPlanSkip } from "@/lib/context-types";

const DAY_MS = 86_400_000;

// Days between a date and its data reliably being available from GeoDaRT.
export const PUBLICATION_LAG_DAYS: Partial<Record<ProductCode, number>> = {
  USDroughtMonitor: 9,
  Sentinel2: 5,
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const ms = (s: string) => Date.parse(`${s}T00:00:00Z`);
const addDays = (s: string, n: number) => iso(new Date(ms(s) + n * DAY_MS));

export function todayIso(): string {
  return iso(new Date());
}

function ringBounds(ring: unknown): Bounds | null {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of ring) {
    if (!Array.isArray(p) || typeof p[0] !== "number" || typeof p[1] !== "number") return null;
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
  }
  return [minX, minY, maxX, maxY];
}

// Small tolerance: bboxRing rounds to 1e-6°.
const EPS = 2e-6;
export function boundsContain(outer: Bounds, inner: Bounds): boolean {
  return outer[0] <= inner[0] + EPS && outer[1] <= inner[1] + EPS && outer[2] >= inner[2] - EPS && outer[3] >= inner[3] - EPS;
}

/** Merges [start, end] date intervals that overlap or touch (inclusive days). */
export function mergeIntervals(list: [string, string][]): [string, string][] {
  const sorted = list.filter(([s, e]) => s <= e).sort((a, b) => a[0].localeCompare(b[0]));
  const out: [string, string][] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= addDays(last[1], 1)) {
      if (e > last[1]) last[1] = e;
    } else out.push([s, e]);
  }
  return out;
}

/** Parts of [start, end] not covered by `intervals` (merged, sorted). */
export function subtractIntervals(start: string, end: string, intervals: [string, string][]): [string, string][] {
  const gaps: [string, string][] = [];
  let cursor = start;
  for (const [s, e] of intervals) {
    if (e < cursor) continue;
    if (s > end) break;
    if (s > cursor) gaps.push([cursor, addDays(s, -1) < end ? addDays(s, -1) : end]);
    cursor = addDays(e, 1);
    if (cursor > end) return gaps;
  }
  if (cursor <= end) gaps.push([cursor, end]);
  return gaps;
}

/** The farm's current field + zone extent (unbuffered). */
async function currentFarmBounds(farmId: number): Promise<Bounds | null> {
  const farm = await prisma.farm.findUnique({
    where: { id: farmId },
    select: { Fields: { select: { geometry: true } }, ExperimentZones: { select: { geometry: true } } },
  });
  if (!farm) return null;
  return unionBounds([
    ...farm.Fields.map((f) => geojsonBounds(f.geometry)),
    ...farm.ExperimentZones.map((z) => geojsonBounds(z.geometry)),
  ]);
}

export async function getContextCoverage(farmId: number, today = todayIso()): Promise<ContextCoverageDTO> {
  const [bounds, jobs] = await Promise.all([
    currentFarmBounds(farmId),
    prisma.contextFetchJob.findMany({
      where: { farm_id: farmId },
      orderBy: { created_at: "desc" },
      select: {
        id: true, status: true, products: true, start_date: true, end_date: true, buffer_m: true, aoi: true,
        product_results: true, submitted_at: true, created_at: true,
      },
    }),
  ]);

  const inFlight = jobs.some((j) => ["pending", "submitted", "running"].includes(j.status));
  const finished = jobs.filter((j) => j.status === "success" || j.status === "partial");

  // Jobs whose AOI still contains the farm; with no geometry nothing counts.
  const counted = bounds
    ? finished.filter((j) => {
        const b = ringBounds(j.aoi);
        return b != null && boundsContain(b, bounds);
      })
    : [];
  const aoiChanged = finished.length > 0 && counted.length === 0;
  const ref = counted[0] ?? null; // newest

  const products = {} as ContextCoverageDTO["products"];
  for (const code of ALL_PRODUCTS) {
    const timeVarying = PRODUCTS[code].timeVarying;
    const intervals: [string, string][] = [];
    let covered = false;
    for (const j of counted) {
      const results = (j.product_results ?? {}) as Record<string, { ok?: boolean }>;
      if (!(j.products as string[]).includes(code) || !results[code]?.ok) continue;
      covered = true;
      if (!timeVarying) continue;
      const lag = PUBLICATION_LAG_DAYS[code] ?? 0;
      const lookedAt = iso(j.submitted_at ?? j.created_at);
      const availableThrough = addDays(lookedAt, -lag);
      const end = iso(j.end_date) < availableThrough ? iso(j.end_date) : availableThrough;
      intervals.push([iso(j.start_date), end]);
    }
    const merged = timeVarying ? mergeIntervals(intervals) : [];
    products[code] = { static: !timeVarying, covered: timeVarying ? merged.length > 0 : covered, intervals: merged };
  }

  return {
    hasGeometry: bounds != null,
    aoi: ref ? (ref.aoi as [number, number][]) : null,
    bufferM: ref?.buffer_m ?? null,
    aoiChanged,
    inFlight,
    anyCovered: Object.values(products).some((p) => p.covered),
    today,
    products,
  };
}

export type PlanArgs =
  | { mode: "update" }
  | { mode: "expand"; startDate: string; endDate: string; products: ProductCode[] };

/**
 * What an Update / Expand needs to fetch, as one group per distinct date
 * range (one GeoDaRT job each). Never includes anything already covered.
 */
export function planContextRequests(
  coverage: ContextCoverageDTO,
  args: PlanArgs,
  allowed: (p: ProductCode) => boolean = () => true,
): { groups: ContextPlanGroup[]; skipped: ContextPlanSkip[] } {
  const today = coverage.today;
  const wanted: { product: ProductCode; start: string; end: string }[] = [];
  const skipped: ContextPlanSkip[] = [];

  if (args.mode === "update") {
    for (const code of ALL_PRODUCTS) {
      const c = coverage.products[code];
      if (!c?.covered) continue;
      if (c.static) {
        skipped.push({ product: code, reason: "already downloaded" });
        continue;
      }
      const lastEnd = c.intervals[c.intervals.length - 1][1];
      const start = addDays(lastEnd, 1);
      const lag = PUBLICATION_LAG_DAYS[code] ?? 0;
      if (start > addDays(today, -lag)) {
        skipped.push({ product: code, reason: "up to date" });
        continue;
      }
      wanted.push({ product: code, start, end: today });
    }
  } else {
    const end = args.endDate > today ? today : args.endDate;
    const start = args.startDate;
    for (const code of args.products) {
      const c = coverage.products[code];
      if (!c) continue;
      if (c.static) {
        if (c.covered) skipped.push({ product: code, reason: "already downloaded" });
        else wanted.push({ product: code, start, end });
        continue;
      }
      if (start > end) continue;
      const gaps = subtractIntervals(start, end, c.intervals);
      if (!gaps.length) skipped.push({ product: code, reason: "already have this range" });
      for (const [s, e] of gaps) wanted.push({ product: code, start: s, end: e });
    }
  }

  for (const w of [...wanted]) {
    if (!allowed(w.product)) {
      wanted.splice(wanted.indexOf(w), 1);
      if (!skipped.some((s) => s.product === w.product)) skipped.push({ product: w.product, reason: "needs a GeoDaRT key" });
    }
  }

  // Group time-varying products by identical range; static ones ride along
  // with the first group (their dates are ignored by GeoDaRT).
  const byRange = new Map<string, ContextPlanGroup>();
  const statics: ProductCode[] = [];
  for (const w of wanted) {
    if (PRODUCTS[w.product].timeVarying) {
      const key = `${w.start}|${w.end}`;
      const g = byRange.get(key) ?? { start: w.start, end: w.end, products: [] };
      g.products.push(w.product);
      byRange.set(key, g);
    } else statics.push(w.product);
  }
  const groups = [...byRange.values()].sort((a, b) => a.start.localeCompare(b.start));
  if (statics.length) {
    if (groups.length) groups[0].products.push(...statics);
    else if (args.mode === "expand") {
      const end = args.endDate > today ? today : args.endDate;
      groups.push({ start: args.startDate, end, products: statics });
    }
  }
  return { groups, skipped };
}

// One Update/Expand at a time per farm. The app runs as a single Node process,
// so an in-process lock is enough to stop a double-click or two tabs queuing
// the same range twice (the coverage check below it sees the first request's
// jobs as in flight).
const farmLocks = new Map<number, Promise<unknown>>();
export async function withFarmContextLock<T>(farmId: number, fn: () => Promise<T>): Promise<T> {
  const prev = farmLocks.get(farmId) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  farmLocks.set(farmId, run);
  try {
    return await run;
  } finally {
    if (farmLocks.get(farmId) === run) farmLocks.delete(farmId);
  }
}
