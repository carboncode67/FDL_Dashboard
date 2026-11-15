import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline as streamPipeline } from "stream/promises";
import yauzl from "yauzl";

// Tile-archive ingestion shared by the basemap webhook and yield maps
// (lib/yield-runs.ts): both get one zip of "<z>/<x>/<y>.png" from
// PipelineProcessor and serve it from DATA_DIR/basemap-tiles/<basemap id>/.

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";
export const BASEMAP_TILES_DIR = path.join(DATA_DIR, "basemap-tiles");
export const BASEMAP_SOURCES_DIR = path.join(DATA_DIR, "basemap-sources");

// Streams the tile-archive zip to a temp file, authenticated the same way
// ingestOutputRasters() pulls a pipeline output — Bearer PROCESSING_API_KEY,
// the same shared secret PipelineProcessor's _check_auth expects. Streamed
// rather than buffered in memory (context-fetch.ts's downloadZip pattern):
// a real drone-orthomosaic tile pyramid can be thousands of small PNGs, and
// while PNG-compressed tiles are far smaller than the raw source raster,
// there's no reason to hold the whole archive in the Node heap either.
export async function downloadTileArchive(url: string, dest: string): Promise<void> {
  const apiKey = process.env.PROCESSING_API_KEY;
  const res = await fetch(url, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} });
  if (!res.ok || !res.body) throw new Error(`tile archive download failed: ${res.status}`);
  await streamPipeline(
    Readable.fromWeb(res.body as import("stream/web").ReadableStream),
    fs.createWriteStream(dest)
  );
}

// Extracts every "<z>/<x>/<y>.png" entry from the zip into destDir, preserving
// that directory structure — same yauzl lazyEntries walk as
// context-fetch.ts's extractTifs, generalized to nested paths instead of a
// flat rename. Returns the number of tile files extracted.
export function extractTiles(zipPath: string, destDir: string): Promise<number> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("bad zip"));
      let count = 0;
      zip.on("error", reject);
      zip.on("end", () => resolve(count));
      zip.on("entry", (entry) => {
        if (/\/$/.test(entry.fileName)) return zip.readEntry();
        // entry.fileName is "<z>/<x>/<y>.png", written by PipelineProcessor's
        // zipfile.write(abs_path, arcname) with tiles_dir-relative arcnames —
        // normalize + strip any leading ".." before joining, same
        // path-traversal posture as every other file-serving route here.
        const safeRel = path.normalize(entry.fileName).replace(/^(\.\.(\/|\\|$))+/, "");
        const dest = path.join(destDir, safeRel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        zip.openReadStream(entry, (e, rs) => {
          if (e || !rs) return reject(e ?? new Error("read stream"));
          const ws = fs.createWriteStream(dest);
          rs.pipe(ws);
          ws.on("error", reject);
          ws.on("finish", () => {
            count++;
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}
