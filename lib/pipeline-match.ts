// The moment an upload becomes "categorized enough to match" (Data Sorting
// save, document uploads, kept farm documents, test-data row ingestion):
// declarative pipelines' trigger rules get a look at it
// (lib/pipeline-triggers.ts, migration 107). The legacy script pipelines that
// used to fire here were removed (docs/pipeline-requests-plan.md, phase 3).
// Best-effort: a processing-machine failure never fails the caller's request.

export interface MatchTriggerOpts {
  table: string;
  id: number;
  category?: string | null;
  project_id?: number | null;
  data_table_id?: number | null;
  /** Unused since the legacy pipelines went; callers still pass it. */
  inputFileUrl?: string;
}

export async function matchAndTriggerPipelines(opts: MatchTriggerOpts): Promise<void> {
  // Loaded lazily: pipeline-triggers → pipeline-catalog → yield-runs →
  // farm-document-copy imports this module.
  const { fireTriggers } = await import("@/lib/pipeline-triggers");
  await fireTriggers({
    table: opts.table, id: opts.id, category: opts.category ?? null,
    project_id: opts.project_id ?? null, data_table_id: opts.data_table_id ?? null,
  });
}
