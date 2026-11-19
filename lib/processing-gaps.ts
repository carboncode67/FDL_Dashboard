import { prisma } from "@/lib/prisma";
import { findMatchingLivePipelines } from "@/lib/pipeline-match";
import { isDataProduct } from "@/lib/data-products";

/**
 * "Unprocessable data" flags (GitHub issue #3, migration 102,
 * docs/unprocessable-data-flag-plan.md).
 *
 * The agent only classifies (Agent_Observations.data_product). This module
 * decides: a gap is OPEN when
 *   - the upload is sorted (status ≥ 3 or has a category — pipelines only match
 *     after sorting, so an unsorted yield file isn't "unprocessable" yet),
 *   - its current observation names a data product (not "none"),
 *   - the lab hasn't said "never flag this type" (Processing_Gap_Ignores), and
 *   - no tool covers it: no live pipeline matches its scope, no pipeline run or
 *     yield run used it, no Data Table template matched it.
 * A tool appearing later RESOLVES the gap; a person DISMISSES it. A dismissed gap
 * is never re-opened, so a dismissal survives re-observation.
 *
 * Everything here is best-effort: callers catch and log, a failure must never
 * fail the observation write, the sort, or the pipeline update that called it.
 */

/** Gap source tables (agent registry names) → the upload slug pipelines and runs use. */
export const GAP_TABLES: Record<string, string> = {
  photos: "photos",
  notes: "notes",
  lab_member_uploads: "lab-member-uploads",
  documents: "documents",
};

/** Data Sorting / uploads-PATCH slug → gap source table. */
export function gapTableForSlug(slug: string): string | null {
  for (const [table, s] of Object.entries(GAP_TABLES)) if (s === slug) return table;
  return null;
}

interface UploadScope {
  status: number;
  category: string | null;
  project_id: number | null;
  farm_id: number | null;
  data_table_id: number | null;
}

async function loadUpload(table: string, id: number): Promise<UploadScope | null> {
  const sel = { status: true, category: true, project_id: true, farm_id: true } as const;
  switch (table) {
    case "photos": {
      const r = await prisma.photo.findUnique({ where: { id }, select: sel });
      return r && { ...r, data_table_id: null };
    }
    case "notes": {
      const r = await prisma.note.findUnique({ where: { id }, select: sel });
      return r && { ...r, data_table_id: null };
    }
    case "lab_member_uploads": {
      const r = await prisma.labMemberUpload.findUnique({ where: { id }, select: sel });
      return r && { ...r, data_table_id: null };
    }
    case "documents":
      return prisma.document.findUnique({ where: { id }, select: { ...sel, data_table_id: true } });
    default:
      return null;
  }
}

/** The pipeline covering this upload (0 = covered by something that isn't a pipeline), or null if none. */
async function coveringTool(table: string, id: number, up: UploadScope): Promise<number | null> {
  const slug = GAP_TABLES[table];
  if (up.data_table_id != null) return 0; // test-data template matched; rows go through the ingest route
  if (table === "documents") {
    const yr = await prisma.yieldRun.findFirst({ where: { source_document_id: id }, select: { id: true } });
    if (yr) return 0;
  }
  const run = await prisma.pipelineRun.findFirst({
    where: { trigger_upload_table: slug, trigger_upload_id: id, status: { not: "failed" } },
    select: { pipeline_id: true },
    orderBy: { id: "desc" },
  });
  if (run) return run.pipeline_id;
  const [live] = await findMatchingLivePipelines({
    table: slug, category: up.category, project_id: up.project_id, data_table_id: up.data_table_id,
  });
  return live ? live.id : null;
}

export type GapOutcome = "opened" | "updated" | "resolved" | "removed" | "unchanged";

/**
 * Re-decide one upload's gap from its current state. Safe to call any time,
 * as often as you like.
 */
export async function evaluateGap(table: string, id: number): Promise<GapOutcome> {
  if (!(table in GAP_TABLES)) return "unchanged";

  const obs = await prisma.agentObservation.findFirst({
    where: { source_table: table, source_id: id, status: "current" },
    select: { id: true, lab_id: true, data_product: true },
    orderBy: { id: "desc" },
  });
  const existing = await prisma.processingGap.findFirst({ where: { source_table: table, source_id: id } });
  if (existing?.status === "dismissed") return "unchanged";

  const labId = obs?.lab_id ?? existing?.lab_id;
  const up = await loadUpload(table, id);
  const product = obs?.data_product;
  const ignored = labId != null && isDataProduct(product)
    ? await prisma.processingGapIgnore.findFirst({ where: { lab_id: labId, data_product: product }, select: { id: true } })
    : null;
  const eligible =
    labId != null && up != null && isDataProduct(product) && product !== "none" && !ignored &&
    (up.status >= 3 || !!up.category);

  if (!eligible) {
    // Not data, not sorted any more, or the type is ignored: an open/resolved
    // gap no longer applies. (Dismissed rows were returned above.)
    if (existing) {
      await prisma.processingGap.delete({ where: { id: existing.id } });
      return "removed";
    }
    return "unchanged";
  }

  const tool = await coveringTool(table, id, up!);
  if (tool != null) {
    if (existing?.status === "open") {
      await prisma.processingGap.update({
        where: { id: existing.id },
        data: { status: "resolved", resolved_by_pipeline_id: tool || null, decided_at: new Date() },
      });
      return "resolved";
    }
    return "unchanged"; // never flagged, or already resolved — nothing to say
  }

  if (!existing) {
    await prisma.processingGap.create({
      data: {
        lab_id: labId!, source_table: table, source_id: id, farm_id: up!.farm_id,
        data_product: product!, observation_id: obs!.id,
      },
    });
    return "opened";
  }
  // Open (refresh the classification) or resolved (its tool went away → re-open).
  await prisma.processingGap.update({
    where: { id: existing.id },
    data: {
      status: "open", data_product: product!, observation_id: obs!.id, farm_id: up!.farm_id,
      resolved_by_pipeline_id: null, decided_at: null, decided_by_id: null,
    },
  });
  return existing.status === "open" && existing.data_product === product ? "unchanged" : "updated";
}

/** evaluateGap that logs instead of throwing — for hooks on other writes. */
export function evaluateGapQuietly(table: string, id: number): Promise<void> {
  return evaluateGap(table, id).then(
    () => undefined,
    (err) => console.error(`[processing-gaps] evaluate ${table}/${id} failed`, err),
  );
}

const REEVALUATE_MAX = 5000;

/**
 * Re-decide every open or resolved gap (optionally one lab's) — after a pipeline
 * goes live, is disabled, or changes its match scope. Returns how many changed.
 */
export async function reevaluateGaps(labId?: number | null): Promise<number> {
  const rows = await prisma.processingGap.findMany({
    where: { status: { in: ["open", "resolved"] }, ...(labId != null ? { lab_id: labId } : {}) },
    select: { source_table: true, source_id: true },
    orderBy: { id: "asc" },
    take: REEVALUATE_MAX,
  });
  let changed = 0;
  for (const r of rows) {
    if ((await evaluateGap(r.source_table, r.source_id)) !== "unchanged") changed++;
  }
  return changed;
}

export function reevaluateGapsQuietly(labId?: number | null): void {
  reevaluateGaps(labId).catch((err) => console.error("[processing-gaps] re-evaluate failed", err));
}
