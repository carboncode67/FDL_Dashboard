/**
 * Poll / download / ingest for the "Pull spatial context" feature.
 *
 * `advanceContextJobs()` is called on a node-cron interval (see lib/scheduler.ts).
 * It walks every in-flight Context_Fetch_Jobs row, polls its GeoDaRT job, and once
 * GeoDaRT reports done, streams the signed zip to disk, extracts each COG into
 * DATA_DIR/context/, and writes Context_Rasters rows.
 */

import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { Readable } from "stream";
import { pipeline as streamPipeline } from "stream/promises";
import yauzl from "yauzl";
import { prisma } from "@/lib/prisma";
import { DATA_DIR } from "@/lib/data-api";
import {
  submitJob,
  getJob,
  parseProductResults,
  jobDownloadLink,
  TERMINAL_STATUSES,
  type ProductCode,
} from "@/lib/geodart";

const CONTEXT_DIR = path.join(DATA_DIR, "context");
const CLAIM_STALE_MS = 5 * 60_000;

// Same token → product mapping as FarmersDatabase/Client/fetch_spatial_context.py
const PRODUCT_MATCH_TOKENS: Record<string, string[]> = {
  SOLUS: ["solus"],
  POLARIS: ["polaris"],
  USGS3DEP_10m: ["usgs3dep", "3dep", "terrain", "dem", "slope", "aspect"],
  Sentinel2: ["sentinel", "s2", "ndvi", "tci", "_b0", "_b1", "_b2", "_b3", "_b4", "_b5", "_b6", "_b7", "_b8", "_b9"],
  USDroughtMonitor: ["usdm", "drought"],
};

function sortProduct(relPath: string): string {
  const low = relPath.toLowerCase();
  for (const [product, tokens] of Object.entries(PRODUCT_MATCH_TOKENS)) {
    if (tokens.some((t) => low.includes(t))) return product;
  }
  return "misc";
}

function captureDateFromName(name: string): Date | null {
  const m = name.match(/(20\d{2})[-_]?(\d{2})[-_]?(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

interface ExtractedRaster {
  product: string;
  filename: string;
  bytes: number;
  sha256: string;
  captureDate: Date | null;
}

async function downloadZip(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`download ${res.status}`);
  await streamPipeline(Readable.fromWeb(res.body as import("stream/web").ReadableStream), fs.createWriteStream(dest));
}

function extractTifs(zipPath: string, jobId: number): Promise<ExtractedRaster[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("bad zip"));
      const out: ExtractedRaster[] = [];
      const counts: Record<string, number> = {};
      zip.on("error", reject);
      zip.on("end", () => resolve(out));
      zip.on("entry", (entry) => {
        if (/\/$/.test(entry.fileName) || !/\.tiff?$/i.test(entry.fileName)) {
          return zip.readEntry();
        }
        zip.openReadStream(entry, (e, rs) => {
          if (e || !rs) return reject(e ?? new Error("read stream"));
          const product = sortProduct(entry.fileName);
          const n = (counts[product] = (counts[product] ?? 0) + 1);
          const filename = `ctx_${jobId}_${product}_${String(n).padStart(3, "0")}.tif`;
          const dest = path.join(CONTEXT_DIR, filename);
          const hash = crypto.createHash("sha256");
          let bytes = 0;
          rs.on("data", (c: Buffer) => {
            bytes += c.length;
            hash.update(c);
          });
          const ws = fs.createWriteStream(dest);
          rs.pipe(ws);
          ws.on("error", reject);
          ws.on("finish", () => {
            out.push({
              product,
              filename,
              bytes,
              sha256: hash.digest("hex"),
              captureDate: captureDateFromName(path.basename(entry.fileName)),
            });
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

type Job = Awaited<ReturnType<typeof prisma.contextFetchJob.findFirst>>;

function ring(job: NonNullable<Job>): [number, number][] {
  return Array.isArray(job.aoi) ? (job.aoi as [number, number][]) : [];
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function advanceJob(job: NonNullable<Job>): Promise<void> {
  // --- (re)submit a job that never made it to GeoDaRT ---
  if (job.status === "pending" || !job.geodart_job_id) {
    try {
      const { jobId, requestId } = await submitJob({
        aoiRing: ring(job),
        startDate: iso(job.start_date),
        endDate: iso(job.end_date),
        products: job.products as ProductCode[],
        exportFormat: (job.export_format as "GeoTIFF" | "COG" | "NETCDF") ?? "COG",
      });
      await prisma.contextFetchJob.update({
        where: { id: job.id },
        data: { status: "submitted", geodart_job_id: jobId, geodart_request_id: requestId, submitted_at: new Date(), error_message: null },
      });
    } catch (err) {
      await prisma.contextFetchJob.update({
        where: { id: job.id },
        data: { status: "pending", error_message: err instanceof Error ? err.message : String(err) },
      });
    }
    return;
  }

  // --- poll ---
  const gj = await getJob(job.geodart_job_id);
  const status = String(gj.status ?? "");
  const progress = Number(gj.progress ?? job.progress) || 0;

  if (!TERMINAL_STATUSES.has(status)) {
    await prisma.contextFetchJob.update({
      where: { id: job.id },
      data: { status: "running", progress },
    });
    return;
  }

  // --- terminal: ingest ---
  const results = parseProductResults(gj);
  const link = jobDownloadLink(gj);
  const footprint = { type: "Polygon", coordinates: [ring(job)] };
  let rasters: ExtractedRaster[] = [];

  if (link) {
    fs.mkdirSync(CONTEXT_DIR, { recursive: true });
    const tmp = path.join(os.tmpdir(), `ctx_${job.id}_${Date.now()}.zip`);
    try {
      await downloadZip(link, tmp);
      rasters = await extractTifs(tmp, job.id);
    } finally {
      fs.rm(tmp, { force: true }, () => {});
    }
  }

  if (rasters.length) {
    await prisma.contextRaster.createMany({
      skipDuplicates: true,
      data: rasters.map((r) => ({
        job_id: job.id,
        farm_id: job.farm_id,
        product: r.product,
        start_date: job.start_date,
        end_date: job.end_date,
        capture_date: r.captureDate,
        filename: r.filename,
        bytes: BigInt(r.bytes),
        sha256: r.sha256,
        footprint,
        crs: "EPSG:4326",
      })),
    });
  }

  const requested = job.products as string[];
  const okCount = requested.filter((p) => results[p]?.ok).length;
  const finalStatus = okCount === requested.length && okCount > 0 ? "success" : okCount > 0 ? "partial" : "failed";

  await prisma.contextFetchJob.update({
    where: { id: job.id },
    data: {
      status: finalStatus,
      progress: 100,
      product_results: JSON.parse(JSON.stringify(results)),
      error_message: finalStatus === "failed" ? (gj.error_message ?? "GeoDaRT job failed") : null,
      finished_at: new Date(),
    },
  });
}

export async function advanceContextJobs(): Promise<void> {
  const jobs = await prisma.contextFetchJob.findMany({
    where: { status: { in: ["pending", "submitted", "running"] } },
    orderBy: { id: "asc" },
  });

  for (const job of jobs) {
    const staleBefore = new Date(Date.now() - CLAIM_STALE_MS);
    const claim = await prisma.contextFetchJob.updateMany({
      where: { id: job.id, OR: [{ claimed_at: null }, { claimed_at: { lt: staleBefore } }] },
      data: { claimed_at: new Date() },
    });
    if (claim.count !== 1) continue;

    try {
      await advanceJob(job);
    } catch (err) {
      await prisma.contextFetchJob.update({
        where: { id: job.id },
        data: { error_message: err instanceof Error ? err.message : String(err) },
      }).catch(() => {});
    } finally {
      await prisma.contextFetchJob.update({ where: { id: job.id }, data: { claimed_at: null } }).catch(() => {});
    }
  }
}
