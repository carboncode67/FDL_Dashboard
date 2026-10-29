/**
 * Field-scoped cloud scoring for GeoDaRT Sentinel-2 dates. A date is kept only
 * if at least MIN_FIELD_CLEAR_FRACTION of the pixels inside the farm's field
 * polygons are clear by SCL — so a scene that's cloudy over the woods next door
 * but clear over the fields stays, and one with clouds parked on the fields goes.
 *
 * Used in three places:
 *  - lib/context-fetch.ts, at ingest: a cloudy date's file is deleted before a
 *    Context_Rasters row is ever written.
 *  - pruneCloudyImagery(), swept once at server start (lib/scheduler.ts), for
 *    dates ingested before this filter existed or before the farm's fields were
 *    drawn/edited.
 *  - the imagery route, for the map's "% clear" readout.
 *
 * GeoDaRT does no per-pixel cloud masking itself (see
 * docs/sentinel-imagery-viewer-plan.md, "How cloud cover works"), so this reads
 * SCL + B02 directly, at native resolution, with the same cloud/haze test as
 * the renderer (isCloudy in lib/imagery-render.ts). Scores are cached on disk under
 * THUMBNAIL_DIR keyed by file hash + field geometry, so a restart's sweep only
 * re-reads files whose fields changed.
 */
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fromFile, type GeoTIFFImage } from "geotiff";
import { prisma } from "@/lib/prisma";
import { DATA_DIR } from "@/lib/data-api";
import { geojsonBounds, pointInGeometry } from "@/lib/geo";
import { boaOffset, isCloudy, SCL_INVALID } from "@/lib/imagery-render";

// Drop a date when more than half of the field pixels are cloud (or no data).
export const MIN_FIELD_CLEAR_FRACTION = 0.5;

const CACHE_DIR = path.join(process.env.THUMBNAIL_DIR ?? "./thumbnail-cache", "context-imagery");
const SCORE_DIR = path.join(CACHE_DIR, "cloud");
// Bump to invalidate cached scores after changing the scoring rule.
const SCORE_VERSION = 2;

// GeoDaRT's default band order, see lib/imagery-render.ts
const DEFAULT_BAND_INDEX: Record<string, number> = { B02: 1, SCL: 14 };

export interface CloudScore {
  // Fields scope: clear pixels / all pixels inside the fields (no-data counts
  // against). Raster scope: clear / valid over the whole file.
  clearFraction: number;
  // "raster" when the farm has no field geometry, or none of it lands on a
  // pixel centre of this file.
  scope: "fields" | "raster";
}

export async function farmFieldGeometries(farmId: number): Promise<string[]> {
  const fields = await prisma.field.findMany({
    where: { Farms_id: farmId, geometry: { not: null } },
    select: { geometry: true },
  });
  return fields.map((f) => f.geometry!).filter(Boolean);
}

export function geometryKey(geoms: string[]): string {
  return crypto.createHash("sha256").update([...geoms].sort().join("\n")).digest("hex").slice(0, 16);
}

const inflight = new Map<string, Promise<CloudScore>>();

/** Cached score for one file. `sha256` is the file's content hash (Context_Rasters.sha256). */
export function cloudScore(sourcePath: string, sha256: string, geoms: string[], captureDate: Date | null): Promise<CloudScore> {
  const key = `${sha256.slice(0, 32)}.${geometryKey(geoms)}.v${SCORE_VERSION}`;
  let p = inflight.get(key);
  if (!p) {
    p = loadOrScore(sourcePath, key, geoms, captureDate).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

async function loadOrScore(sourcePath: string, key: string, geoms: string[], captureDate: Date | null): Promise<CloudScore> {
  const scorePath = path.join(SCORE_DIR, `${key}.json`);
  try {
    return JSON.parse(await fs.readFile(scorePath, "utf8")) as CloudScore;
  } catch {
    // cache miss — score below
  }
  const score = await scoreCloud(sourcePath, geoms, captureDate);
  await fs.mkdir(SCORE_DIR, { recursive: true });
  await fs.writeFile(scorePath, JSON.stringify(score));
  return score;
}

function bandIndex(image: GeoTIFFImage, name: string): number {
  const n = image.getSamplesPerPixel();
  for (let i = 0; i < n; i++) {
    if (image.getGDALMetadata(i)?.DESCRIPTION === name) return i;
  }
  if (DEFAULT_BAND_INDEX[name] < n) return DEFAULT_BAND_INDEX[name];
  throw new Error(`Sentinel-2 raster has no ${name} band`);
}

export async function scoreCloud(sourcePath: string, geoms: string[], captureDate: Date | null): Promise<CloudScore> {
  const tiff = await fromFile(sourcePath);
  try {
    const image = await tiff.getImage();
    const [minX, minY, maxX, maxY] = image.getBoundingBox();
    const w = image.getWidth();
    const h = image.getHeight();
    const [scl, b02] = (await image.readRasters({
      samples: [bandIndex(image, "SCL"), bandIndex(image, "B02")],
    })) as unknown as Float32Array[];
    const offset = boaOffset(captureDate);
    const isValid = (s: number) => Number.isFinite(s) && !SCL_INVALID.has(s);
    const isClear = (i: number) => !isCloudy(scl[i], (b02[i] - offset) / 10_000);

    // Mark every pixel whose centre falls in any field; overlapping fields
    // count a pixel once. Each field only scans its own bbox.
    const inField = new Uint8Array(w * h);
    let fieldPixels = 0;
    for (const g of geoms) {
      let geom: unknown;
      try {
        geom = JSON.parse(g);
      } catch {
        continue;
      }
      const b = geojsonBounds(g);
      if (!b) continue;
      const x0 = Math.max(0, Math.floor(((b[0] - minX) / (maxX - minX)) * w));
      const x1 = Math.min(w - 1, Math.ceil(((b[2] - minX) / (maxX - minX)) * w));
      const y0 = Math.max(0, Math.floor(((maxY - b[3]) / (maxY - minY)) * h));
      const y1 = Math.min(h - 1, Math.ceil(((maxY - b[1]) / (maxY - minY)) * h));
      for (let y = y0; y <= y1; y++) {
        const lat = maxY - ((y + 0.5) * (maxY - minY)) / h;
        for (let x = x0; x <= x1; x++) {
          const i = y * w + x;
          if (inField[i]) continue;
          if (pointInGeometry(lat, minX + ((x + 0.5) * (maxX - minX)) / w, geom)) {
            inField[i] = 1;
            fieldPixels++;
          }
        }
      }
    }

    if (fieldPixels > 0) {
      let clear = 0;
      for (let i = 0; i < w * h; i++) {
        if (inField[i] && isValid(scl[i]) && isClear(i)) clear++;
      }
      return { clearFraction: clear / fieldPixels, scope: "fields" };
    }

    let valid = 0;
    let clear = 0;
    for (let i = 0; i < w * h; i++) {
      if (!isValid(scl[i])) continue;
      valid++;
      if (isClear(i)) clear++;
    }
    return { clearFraction: valid ? clear / valid : 0, scope: "raster" };
  } finally {
    tiff.close();
  }
}

/**
 * Deletes every Sentinel-2 date (row, file and cached renders) whose field
 * clear fraction is below MIN_FIELD_CLEAR_FRACTION. All farms when `farmId`
 * is omitted. `dryRun` reports without deleting.
 */
export async function pruneCloudyImagery(opts: { farmId?: number; dryRun?: boolean } = {}) {
  const rows = await prisma.contextRaster.findMany({
    where: { product: "Sentinel2", ...(opts.farmId ? { farm_id: opts.farmId } : {}) },
    select: { id: true, farm_id: true, filename: true, sha256: true, capture_date: true },
    orderBy: [{ farm_id: "asc" }, { capture_date: "asc" }],
  });
  const geomsByFarm = new Map<number, string[]>();
  const removed: { id: number; farmId: number; date: string | null; clearFraction: number }[] = [];
  let checked = 0;

  for (const r of rows) {
    let geoms = geomsByFarm.get(r.farm_id);
    if (!geoms) geomsByFarm.set(r.farm_id, (geoms = await farmFieldGeometries(r.farm_id)));
    const filePath = path.join(DATA_DIR, "context", path.basename(r.filename));
    let score: CloudScore;
    try {
      score = await cloudScore(filePath, r.sha256, geoms, r.capture_date);
    } catch (err) {
      console.error(`[imagery-cloud] couldn't score context raster ${r.id} (${r.filename}):`, err);
      continue;
    }
    checked++;
    if (score.clearFraction >= MIN_FIELD_CLEAR_FRACTION) continue;

    removed.push({
      id: r.id,
      farmId: r.farm_id,
      date: r.capture_date?.toISOString().slice(0, 10) ?? null,
      clearFraction: score.clearFraction,
    });
    if (opts.dryRun) continue;
    // deleteMany: a concurrent sweep (dev HMR re-running the scheduler) may
    // already have removed the row.
    await prisma.contextRaster.deleteMany({ where: { id: r.id } });
    await fs.rm(filePath, { force: true });
    await removeRenders(path.parse(r.filename).name);
  }
  return { checked, removed };
}

async function removeRenders(stem: string) {
  let names: string[];
  try {
    names = await fs.readdir(CACHE_DIR);
  } catch {
    return;
  }
  await Promise.all(
    names.filter((n) => n.startsWith(`${stem}.`)).map((n) => fs.rm(path.join(CACHE_DIR, n), { force: true }))
  );
}
