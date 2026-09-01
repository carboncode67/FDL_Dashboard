/** Plain shapes for Context_Fetch_Jobs / Context_Rasters — safe to pass from a
 *  server component to a client component (no BigInt, no Date objects). */

export interface ContextRasterDTO {
  id: number;
  product: string;
  band_names: string[];
  start_date: string | null;
  end_date: string | null;
  capture_date: string | null;
  filename: string;
  bytes: number;
  crs: string | null;
}

export interface ContextJobDTO {
  id: number;
  products: string[];
  start_date: string;
  end_date: string;
  buffer_m: number;
  status: string;
  progress: number;
  product_results: Record<string, { ok: boolean; detail?: string }>;
  error_message: string | null;
  created_at: string;
  finished_at: string | null;
  rasters: ContextRasterDTO[];
}

function d(v: Date | null | undefined): string | null {
  return v ? new Date(v).toISOString().slice(0, 10) : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeContextJob(job: any): ContextJobDTO {
  return {
    id: job.id,
    products: job.products ?? [],
    start_date: d(job.start_date) ?? "",
    end_date: d(job.end_date) ?? "",
    buffer_m: job.buffer_m,
    status: job.status,
    progress: job.progress,
    product_results: (job.product_results ?? {}) as ContextJobDTO["product_results"],
    error_message: job.error_message ?? null,
    created_at: new Date(job.created_at).toISOString(),
    finished_at: job.finished_at ? new Date(job.finished_at).toISOString() : null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rasters: (job.Rasters ?? []).map((r: any) => ({
      id: r.id,
      product: r.product,
      band_names: r.band_names ?? [],
      start_date: d(r.start_date),
      end_date: d(r.end_date),
      capture_date: d(r.capture_date),
      filename: r.filename,
      bytes: Number(r.bytes),
      crs: r.crs ?? null,
    })),
  };
}
