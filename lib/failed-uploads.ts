import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { BASEMAP_SOURCES_DIR, BASEMAP_TILES_DIR } from "@/lib/basemap-tiles";
import { YIELD_SOURCES_DIRNAME, deleteFarmDocument, deleteYieldMapBasemap } from "@/lib/yield-runs";

// "Delete" next to a stuck entry in the farm map's "Processing:" list (and
// OFE's port of it), so failed uploads don't pile up there for good, and the
// × next to a finished basemap / yield layer (allowReady: the caller has
// checked delete rights). A run in flight (processing / tiling) always 409s.
//
// Yield run: the row, its card zip under yield-sources/, its source Document
// (the uploaded card) and anything an earlier successful attempt left (points
// layer, yield map Basemap, results Document). Basemap: the row, its source
// file under basemap-sources/ and any partial tiles; the farm Document the
// upload box kept of the original isn't linked to the row and stays in the
// Documents tab.

const DATA_DIR = process.env.DATA_DIR ?? "./upload-data";
const DELETABLE = new Set(["failed", "pending"]);
const IN_FLIGHT = new Set(["processing", "tiling"]);

/** 409 while in flight, or when ready and the caller may only clear failed/queued ones. */
function blocked(status: string, allowReady: boolean, what: string): NextResponse | null {
  if (DELETABLE.has(status) || (allowReady && !IN_FLIGHT.has(status))) return null;
  if (IN_FLIGHT.has(status)) {
    return NextResponse.json({ error: `This ${what} is still processing; wait for it to finish` }, { status: 409 });
  }
  return NextResponse.json({ error: `Deleting a finished ${what} needs delete rights (Edit Mode)` }, { status: 403 });
}

function gone(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** `farmId` set = 404 a run on another farm (the bearer twin). */
export async function deleteFailedYieldRun(runId: number, farmId?: number, allowReady = false): Promise<NextResponse> {
  const run = isNaN(runId) ? null : await prisma.yieldRun.findUnique({ where: { id: runId } });
  if (!run || (farmId != null && run.farm_id !== farmId)) return gone();
  const no = blocked(run.status, allowReady, "yield run");
  if (no) return no;
  await prisma.yieldRun.delete({ where: { id: run.id } });
  if (run.layer_id) await prisma.farmLayer.deleteMany({ where: { id: run.layer_id } });
  if (run.basemap_id) await deleteYieldMapBasemap(run.basemap_id).catch((err) => console.error("[yield delete] map", err));
  for (const docId of [run.source_document_id, run.results_document_id]) {
    if (docId) await deleteFarmDocument(docId).catch((err) => console.error("[yield delete] document", err));
  }
  await fs.promises.rm(path.join(DATA_DIR, YIELD_SOURCES_DIRNAME, path.basename(run.source_filename)), { force: true });
  return NextResponse.json({ ok: true });
}

/** `farmId` set = 404 a basemap on another farm (the bearer twin). */
export async function deleteFailedBasemap(basemapId: number, farmId?: number, allowReady = false): Promise<NextResponse> {
  const bm = isNaN(basemapId) ? null : await prisma.basemap.findUnique({ where: { id: basemapId } });
  if (!bm || (farmId != null && bm.farm_id !== farmId)) return gone();
  const no = blocked(bm.tiling_status, allowReady, "basemap");
  if (no) return no;
  await prisma.basemap.delete({ where: { id: bm.id } });
  await fs.promises.rm(path.join(BASEMAP_TILES_DIR, String(bm.id)), { recursive: true, force: true });
  await fs.promises.rm(path.join(BASEMAP_SOURCES_DIR, path.basename(bm.source_filename)), { force: true });
  return NextResponse.json({ ok: true });
}
