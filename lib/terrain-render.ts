/**
 * Renders a GeoDaRT terrain raster (USGS 3DEP, band 1 = elevation in metres)
 * into a single hillshade × hypsometric-colour WebP for the farm map's Terrain
 * layer, shown client-side as a Leaflet imageOverlay.
 *
 * The hillshade is computed here from elevation rather than taken from the
 * file: GeoDaRT's own slope band is unusable (mean ≈ 89.9°, it treats degree
 * pixel sizes as metres). Renders are cached under THUMBNAIL_DIR like photo
 * thumbnails — a lost cache just re-renders on next view (~1 s).
 */
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { fromFile } from "geotiff";
import { terrainRampColor } from "@/lib/terrain-ramp";

const CACHE_DIR = path.join(process.env.THUMBNAIL_DIR ?? "./thumbnail-cache", "context-terrain");
// Bump to invalidate every cached render after changing the algorithm/ramp.
export const RENDER_VERSION = 1;
const MAX_DIMENSION = 2048;

const SUN_AZIMUTH_DEG = 315;
const SUN_ALTITUDE_DEG = 45;
// Farm-scale relief is subtle at 10 m — exaggerate so field-level slopes read.
const VERTICAL_EXAGGERATION = 2;

export interface TerrainRenderMeta {
  // Leaflet LatLngBounds order: [[south, west], [north, east]]
  bounds: [[number, number], [number, number]];
  // Elevation (m) at the ramp's two ends — 2nd/98th percentile, so a few
  // outlier pixels don't flatten the colour range.
  low: number;
  high: number;
  verticalExaggeration: number;
}

const inflight = new Map<string, Promise<{ meta: TerrainRenderMeta; imagePath: string }>>();

export function ensureTerrainRender(
  sourcePath: string,
  cacheKey: string
): Promise<{ meta: TerrainRenderMeta; imagePath: string }> {
  const key = `${cacheKey}.v${RENDER_VERSION}`;
  let p = inflight.get(key);
  if (!p) {
    p = loadOrRender(sourcePath, key).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

async function loadOrRender(sourcePath: string, key: string) {
  const imagePath = path.join(CACHE_DIR, `${key}.webp`);
  const metaPath = path.join(CACHE_DIR, `${key}.json`);
  try {
    const meta = JSON.parse(await fs.readFile(metaPath, "utf8")) as TerrainRenderMeta;
    await fs.access(imagePath);
    return { meta, imagePath };
  } catch {
    // cache miss — render below
  }

  const { meta, image } = await renderTerrain(sourcePath);
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(imagePath, image);
  await fs.writeFile(metaPath, JSON.stringify(meta));
  return { meta, imagePath };
}

export async function renderTerrain(sourcePath: string): Promise<{ meta: TerrainRenderMeta; image: Buffer }> {
  const tiff = await fromFile(sourcePath);
  try {
    const image = await tiff.getImage();
    const [minX, minY, maxX, maxY] = image.getBoundingBox();
    const srcW = image.getWidth();
    const srcH = image.getHeight();
    const scale = Math.min(1, MAX_DIMENSION / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));
    const nodata = image.getGDALNoData();

    const [band] = (await image.readRasters({ samples: [0], width: w, height: h })) as unknown as Float32Array[];
    const elev = band;
    const valid = new Uint8Array(w * h);
    let validCount = 0;
    for (let i = 0; i < elev.length; i++) {
      const v = elev[i];
      if (Number.isFinite(v) && v !== nodata && v > -1e4) {
        valid[i] = 1;
        validCount++;
      }
    }
    if (validCount === 0) throw new Error("terrain raster has no valid elevation pixels");

    const sorted = new Float32Array(validCount);
    for (let i = 0, j = 0; i < elev.length; i++) if (valid[i]) sorted[j++] = elev[i];
    sorted.sort();
    const low = sorted[Math.floor((validCount - 1) * 0.02)];
    const high = sorted[Math.floor((validCount - 1) * 0.98)];
    const span = high - low || 1;

    // Pixel size in metres. 3DEP from GeoDaRT is geographic (EPSG:4269/4326),
    // so convert degrees using the raster's centre latitude.
    const latRad = (((minY + maxY) / 2) * Math.PI) / 180;
    const cellX = ((maxX - minX) / w) * 111_320 * Math.cos(latRad);
    const cellY = ((maxY - minY) / h) * 110_574;

    const zenith = ((90 - SUN_ALTITUDE_DEG) * Math.PI) / 180;
    const azimuth = ((((360 - SUN_AZIMUTH_DEG + 90) % 360) * Math.PI) / 180);
    const cosZen = Math.cos(zenith);
    const sinZen = Math.sin(zenith);

    const rgba = Buffer.alloc(w * h * 4);
    const at = (x: number, y: number, fallback: number) => {
      const cx = x < 0 ? 0 : x >= w ? w - 1 : x;
      const cy = y < 0 ? 0 : y >= h ? h - 1 : y;
      const i = cy * w + cx;
      return valid[i] ? elev[i] : fallback;
    };

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!valid[i]) continue; // stays fully transparent
        const e = elev[i];
        // Horn's method; row 0 is north, so +y in the grid is southward.
        const a = at(x - 1, y - 1, e), b = at(x, y - 1, e), c = at(x + 1, y - 1, e);
        const d = at(x - 1, y, e), f = at(x + 1, y, e);
        const g = at(x - 1, y + 1, e), hh = at(x, y + 1, e), k = at(x + 1, y + 1, e);
        const dzdx = (c + 2 * f + k - (a + 2 * d + g)) / (8 * cellX);
        const dzdy = (g + 2 * hh + k - (a + 2 * b + c)) / (8 * cellY);
        const slope = Math.atan(VERTICAL_EXAGGERATION * Math.hypot(dzdx, dzdy));
        let aspect = 0;
        if (dzdx !== 0) {
          aspect = Math.atan2(dzdy, -dzdx);
          if (aspect < 0) aspect += 2 * Math.PI;
        } else if (dzdy > 0) aspect = Math.PI / 2;
        else if (dzdy < 0) aspect = (3 * Math.PI) / 2;
        const shade = Math.max(0, cosZen * Math.cos(slope) + sinZen * Math.sin(slope) * Math.cos(azimuth - aspect));

        // Multiply-style blend, lifted so flat ground (shade ≈ cos 45° ≈ 0.71)
        // keeps close to its true ramp colour.
        const light = Math.min(1.15, 0.35 + 0.85 * shade);
        const [r, gg, bb] = terrainRampColor((e - low) / span);
        const o = i * 4;
        rgba[o] = Math.min(255, r * light);
        rgba[o + 1] = Math.min(255, gg * light);
        rgba[o + 2] = Math.min(255, bb * light);
        rgba[o + 3] = 255;
      }
    }

    // Lossy WebP is ~20x smaller than PNG here with no visible difference at
    // map zoom; alpha stays lossless so the nodata edge is crisp.
    const encoded = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
      .webp({ quality: 88, alphaQuality: 100 })
      .toBuffer();
    return {
      image: encoded,
      meta: { bounds: [[minY, minX], [maxY, maxX]], low, high, verticalExaggeration: VERTICAL_EXAGGERATION },
    };
  } finally {
    tiff.close();
  }
}
