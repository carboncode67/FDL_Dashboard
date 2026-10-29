/**
 * Renders one GeoDaRT Sentinel-2 date (a multiband float32 GeoTIFF, one file
 * per acquisition date) into a WebP for the farm map's imagery layer, shown
 * client-side as a Leaflet imageOverlay that follows the timeline playhead.
 *
 * Two things GeoDaRT gets wrong, so this does them itself (see
 * docs/sentinel-imagery-viewer-plan.md, "Phase 0 results"):
 *  - Its NDVI band is computed from raw DNs, ignoring ESA's +1000 reflectance
 *    offset (processing baseline 04.00, every scene since 2022-01-25), which
 *    pulls NDVI down by ~0.2 over crops. NDVI and true colour here both use
 *    offset-corrected reflectance from B04/B08 (and B03/B02).
 *  - It doesn't apply its cloud masking options. Cloud, cloud shadow, cirrus
 *    and snow are masked here from the SCL band, plus haze SCL misses (see
 *    isCloudy below).
 *
 * Bands are looked up by GDAL description (B04, B08, SCL, …), falling back to
 * GeoDaRT's default band order. Only the 3–4 bands a render needs are read —
 * a large farm's file is ~40 MB across all 16 bands once decoded.
 *
 * Renders are cached under THUMBNAIL_DIR like the terrain layer; a lost cache
 * just re-renders on next view.
 */
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { fromFile, type GeoTIFFImage } from "geotiff";
import { ndviRampColor } from "@/lib/ndvi-ramp";

const CACHE_DIR = path.join(process.env.THUMBNAIL_DIR ?? "./thumbnail-cache", "context-imagery");
// Bump to invalidate every cached render after changing the algorithm/ramp.
export const RENDER_VERSION = 3;
const MAX_DIMENSION = 2048;

export type ImageryMode = "ndvi" | "rgb";
export const IMAGERY_MODES: ImageryMode[] = ["ndvi", "rgb"];

// GeoDaRT's multiproduct default band list (Phase 0 test pull), used only when
// a file carries no band descriptions.
const DEFAULT_BAND_ORDER = [
  "B01", "B02", "B03", "B04", "B05", "B06", "B07", "B08", "B8A", "B09", "B11", "B12", "AOT", "WVP", "SCL", "NDVI",
];

// ESA processing baseline 04.00 adds 1000 to every L2A reflectance DN from
// this date on.
const OFFSET_FROM = Date.UTC(2022, 0, 25);
const BOA_OFFSET = 1000;
const QUANTIFICATION = 10_000;

// SCL classes: 0 no data, 1 saturated/defective → always transparent;
// 3 cloud shadow, 7 unclassified (mostly cloud edges), 8/9 cloud medium/high
// probability, 10 thin cirrus, 11 snow → transparent when masking.
export const SCL_INVALID = new Set([0, 1]);
const SCL_CLOUD = new Set([3, 7, 8, 9, 10, 11]);

// SCL misses thin haze: farm 18's 2026-04-21 scene is hazy end to end, all
// classed bare soil/unclassified, and its NDVI reads ~0.17 low against
// 04-24. Haze is bright in blue; clear land sits well under 0.1 B02
// reflectance (median 0.01–0.07 across farm 18's clear dates, under 5% of
// pixels above 0.1), the hazy scene's median is 0.16.
const HAZE_B02_REFLECTANCE = 0.1;

/** Cloud, shadow, cirrus, snow or haze. `b02` is offset-corrected reflectance. */
export function isCloudy(scl: number, b02: number): boolean {
  return SCL_CLOUD.has(scl) || b02 > HAZE_B02_REFLECTANCE;
}

// No capture date → assume a recent scene, which is all GeoDaRT serves today.
export function boaOffset(captureDate: Date | null): number {
  return !captureDate || captureDate.getTime() >= OFFSET_FROM ? BOA_OFFSET : 0;
}

// True colour: fixed reflectance stretch (not per-frame percentiles) so
// brightness doesn't jump between dates while scrubbing.
const RGB_MAX_REFLECTANCE = 0.3;
const RGB_GAMMA = 1 / 1.4;

export interface ImageryRenderMeta {
  // Leaflet LatLngBounds order: [[south, west], [north, east]]
  bounds: [[number, number], [number, number]];
  mode: ImageryMode;
  masked: boolean;
  // Share of the raster's valid pixels that SCL calls clear (not cloud,
  // shadow, cirrus or snow), over the whole raster. The imagery route replaces
  // it with the field-scoped score from lib/imagery-cloud.ts.
  clearFraction: number;
}

const inflight = new Map<string, Promise<{ meta: ImageryRenderMeta; imagePath: string }>>();

export function ensureImageryRender(
  sourcePath: string,
  cacheKey: string,
  opts: { mode: ImageryMode; mask: boolean; captureDate: Date | null }
): Promise<{ meta: ImageryRenderMeta; imagePath: string }> {
  const key = `${cacheKey}.${opts.mode}.${opts.mask ? "masked" : "all"}.v${RENDER_VERSION}`;
  let p = inflight.get(key);
  if (!p) {
    p = loadOrRender(sourcePath, key, opts).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

async function loadOrRender(sourcePath: string, key: string, opts: { mode: ImageryMode; mask: boolean; captureDate: Date | null }) {
  const imagePath = path.join(CACHE_DIR, `${key}.webp`);
  const metaPath = path.join(CACHE_DIR, `${key}.json`);
  try {
    const meta = JSON.parse(await fs.readFile(metaPath, "utf8")) as ImageryRenderMeta;
    await fs.access(imagePath);
    return { meta, imagePath };
  } catch {
    // cache miss — render below
  }

  const { meta, image } = await renderImagery(sourcePath, opts);
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(imagePath, image);
  await fs.writeFile(metaPath, JSON.stringify(meta));
  return { meta, imagePath };
}

function bandIndex(image: GeoTIFFImage, name: string): number {
  const n = image.getSamplesPerPixel();
  for (let i = 0; i < n; i++) {
    if (image.getGDALMetadata(i)?.DESCRIPTION === name) return i;
  }
  const fallback = DEFAULT_BAND_ORDER.indexOf(name);
  if (fallback >= 0 && fallback < n) return fallback;
  throw new Error(`Sentinel-2 raster has no ${name} band`);
}

export async function renderImagery(
  sourcePath: string,
  { mode, mask, captureDate }: { mode: ImageryMode; mask: boolean; captureDate: Date | null }
): Promise<{ meta: ImageryRenderMeta; image: Buffer }> {
  const tiff = await fromFile(sourcePath);
  try {
    const image = await tiff.getImage();
    const [minX, minY, maxX, maxY] = image.getBoundingBox();
    const srcW = image.getWidth();
    const srcH = image.getHeight();
    const scale = Math.min(1, MAX_DIMENSION / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));

    // B02 last but one in both modes: the haze test needs it.
    const names = mode === "ndvi" ? ["B04", "B08", "B02", "SCL"] : ["B04", "B03", "B02", "SCL"];
    const samples = names.map((n) => bandIndex(image, n));
    // nearest-neighbour resampling keeps SCL class values intact when scaled
    const bands = (await image.readRasters({ samples, width: w, height: h, resampleMethod: "nearest" })) as unknown as Float32Array[];
    const scl = bands[bands.length - 1];
    const blue = bands[bands.length - 2];

    const offset = boaOffset(captureDate);
    const refl = (dn: number) => (dn - offset) / QUANTIFICATION;

    const rgba = Buffer.alloc(w * h * 4);
    let validCount = 0;
    let clearCount = 0;
    for (let i = 0; i < w * h; i++) {
      const s = scl[i];
      if (!Number.isFinite(s) || SCL_INVALID.has(s)) continue;
      validCount++;
      const cloudy = isCloudy(s, refl(blue[i]));
      if (!cloudy) clearCount++;
      if (mask && cloudy) continue; // stays fully transparent

      let r: number, g: number, b: number;
      if (mode === "ndvi") {
        const red = refl(bands[0][i]);
        const nir = refl(bands[1][i]);
        const sum = nir + red;
        if (!Number.isFinite(sum) || sum <= 0) continue;
        [r, g, b] = ndviRampColor((nir - red) / sum);
      } else {
        const stretch = (dn: number) => 255 * Math.pow(Math.min(1, Math.max(0, refl(dn) / RGB_MAX_REFLECTANCE)), RGB_GAMMA);
        const rr = bands[0][i], gg = bands[1][i], bb = bands[2][i];
        if (!Number.isFinite(rr) || !Number.isFinite(gg) || !Number.isFinite(bb)) continue;
        r = stretch(rr);
        g = stretch(gg);
        b = stretch(bb);
      }
      const o = i * 4;
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = 255;
    }

    // Lossless: 10 m pixels are shown pixelated, so lossy WebP's blocky
    // artefacts would show up as false texture.
    const encoded = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
      .webp({ lossless: true })
      .toBuffer();
    return {
      image: encoded,
      meta: {
        bounds: [[minY, minX], [maxY, maxX]],
        mode,
        masked: mask,
        clearFraction: validCount ? clearCount / validCount : 0,
      },
    };
  } finally {
    tiff.close();
  }
}
