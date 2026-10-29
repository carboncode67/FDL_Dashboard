/**
 * Builds the farm map's spatial-context timeline: one entry per weekly US
 * Drought Monitor raster (share of the pulled area in each category) plus the
 * dated imagery rasters a future scrubber steps through, all on the date range
 * the farm's GeoDaRT pulls covered.
 *
 * USDM rasters are tiny (~1 km cells, a farm AOI is ~10×10 px), so stats are
 * read straight from the files and memoised per file in-process — no disk
 * cache like the terrain render needs.
 *
 * Only pixels whose centre falls inside the pulled AOI (the raster's
 * `footprint`) are counted: GeoDaRT rasterises over the bbox of a 0.02°
 * round-buffered AOI and fills everything outside the drought polygons with
 * 0 ("no drought"), so the buffer's corners would otherwise show up as a
 * spurious no-drought share.
 */
import path from "path";
import { fromFile } from "geotiff";
import { prisma } from "@/lib/prisma";
import { DATA_DIR } from "@/lib/data-api";
import { pointInGeometry } from "@/lib/geo";
import { USDM_CATEGORIES, decodeUsdm, usdmEncodingFor, type UsdmCategory, type UsdmEncoding } from "@/lib/usdm";

// Below this share for the most common category, a week is flagged as varying
// across the farm instead of being summarised as one category.
const MIXED_THRESHOLD = 0.75;

export interface DroughtWeek {
  date: string; // USDM valid date (a Tuesday), YYYY-MM-DD
  shares: Partial<Record<UsdmCategory, number>>; // 0..1, sums to 1
  dominant: UsdmCategory;
  mixed: boolean;
}

export interface ImageryFrame {
  date: string;
  rasterId: number;
  product: string;
}

export interface ContextTimeline {
  start: string;
  end: string;
  drought: DroughtWeek[];
  imagery: ImageryFrame[];
}

const IMAGERY_PRODUCTS = ["Sentinel2"];

const statsCache = new Map<string, Promise<Partial<Record<UsdmCategory, number>> | null>>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function usdmShares(filename: string, sha256: string, footprint: any, encoding: UsdmEncoding) {
  const key = `${sha256}:${encoding}:${JSON.stringify(footprint)}`;
  let p = statsCache.get(key);
  if (!p) {
    p = readShares(path.join(DATA_DIR, "context", path.basename(filename)), footprint, encoding).catch((err) => {
      console.error(`[context-timeline] couldn't read ${filename}:`, err);
      statsCache.delete(key);
      return null;
    });
    statsCache.set(key, p);
  }
  return p;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readShares(filePath: string, footprint: any, encoding: UsdmEncoding) {
  const tiff = await fromFile(filePath);
  try {
    const image = await tiff.getImage();
    const [band] = (await image.readRasters({ samples: [0] })) as unknown as ArrayLike<number>[];
    const [minX, minY, maxX, maxY] = image.getBoundingBox();
    const w = image.getWidth();
    const h = image.getHeight();
    const lngAt = (x: number) => minX + ((x + 0.5) * (maxX - minX)) / w;
    const latAt = (y: number) => maxY - ((y + 0.5) * (maxY - minY)) / h;

    const tally = (inside: (x: number, y: number) => boolean) => {
      const counts: Partial<Record<UsdmCategory, number>> = {};
      let total = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!inside(x, y)) continue;
          const cat = decodeUsdm(band[y * w + x], encoding);
          if (!cat) continue;
          counts[cat] = (counts[cat] ?? 0) + 1;
          total++;
        }
      }
      return { counts, total };
    };

    let { counts, total } = footprint ? tally((x, y) => pointInGeometry(latAt(y), lngAt(x), footprint)) : { counts: {}, total: 0 };
    // An AOI smaller than one ~1 km cell may contain no pixel centre — fall
    // back to the cell under its centre, then to the whole raster.
    if (total === 0 && footprint?.coordinates?.[0]?.length) {
      const ring = footprint.coordinates[0] as [number, number][];
      const cx = ring.reduce((a, c) => a + c[0], 0) / ring.length;
      const cy = ring.reduce((a, c) => a + c[1], 0) / ring.length;
      const px = Math.floor(((cx - minX) / (maxX - minX)) * w);
      const py = Math.floor(((maxY - cy) / (maxY - minY)) * h);
      ({ counts, total } = tally((x, y) => x === px && y === py));
    }
    if (total === 0) ({ counts, total } = tally(() => true));
    if (total === 0) return null;
    for (const cat of Object.keys(counts) as UsdmCategory[]) counts[cat] = counts[cat]! / total;
    return counts;
  } finally {
    tiff.close();
  }
}

const day = (d: Date) => d.toISOString().slice(0, 10);

export async function buildContextTimeline(farmId: number): Promise<ContextTimeline | null> {
  const rasters = await prisma.contextRaster.findMany({
    where: { farm_id: farmId, product: { in: ["USDroughtMonitor", ...IMAGERY_PRODUCTS] }, capture_date: { not: null } },
    orderBy: { fetched_at: "desc" },
    select: { id: true, product: true, filename: true, sha256: true, footprint: true, capture_date: true, start_date: true, end_date: true, fetched_at: true },
  });
  if (rasters.length === 0) return null;

  // Overlapping pulls: keep the newest file for each product + date.
  const seen = new Set<string>();
  const latest = rasters.filter((r) => {
    const k = `${r.product}:${day(r.capture_date!)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  let start = latest[0].start_date ?? latest[0].capture_date!;
  let end = latest[0].end_date ?? latest[0].capture_date!;
  for (const r of latest) {
    const s = r.start_date ?? r.capture_date!;
    const e = r.end_date ?? r.capture_date!;
    if (s < start) start = s;
    if (e > end) end = e;
  }

  const usdm = latest.filter((r) => r.product === "USDroughtMonitor");
  const drought: DroughtWeek[] = [];
  await Promise.all(
    usdm.map(async (r) => {
      const encoding = usdmEncodingFor(r.fetched_at);
      const shares = await usdmShares(r.filename, r.sha256, r.footprint, encoding);
      if (!shares) return;
      let dominant: UsdmCategory = "none";
      for (const cat of USDM_CATEGORIES) if ((shares[cat] ?? 0) > (shares[dominant] ?? 0)) dominant = cat;
      drought.push({ date: day(r.capture_date!), shares, dominant, mixed: (shares[dominant] ?? 0) < MIXED_THRESHOLD });
    })
  );
  drought.sort((a, b) => a.date.localeCompare(b.date));

  const imagery = latest
    .filter((r) => IMAGERY_PRODUCTS.includes(r.product))
    .map((r) => ({ date: day(r.capture_date!), rasterId: r.id, product: r.product }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (drought.length === 0 && imagery.length === 0) return null;
  return { start: day(start), end: day(end), drought, imagery };
}
