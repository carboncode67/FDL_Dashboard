const PROCESSING_URL = process.env.PROCESSING_URL?.replace(/\/$/, "");
const PROCESSING_API_KEY = process.env.PROCESSING_API_KEY;

export const processingConfigured = Boolean(PROCESSING_URL && PROCESSING_API_KEY);

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${PROCESSING_API_KEY}`, "Content-Type": "application/json" };
}

async function processingFetch(path: string, init?: RequestInit) {
  if (!PROCESSING_URL) throw new Error("PROCESSING_URL is not configured");
  const res = await fetch(`${PROCESSING_URL}${path}`, {
    ...init,
    headers: { ...authHeader(), ...((init?.headers as Record<string, string>) ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Processing machine ${init?.method ?? "GET"} ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Natural-language context about the dataset a pipeline processes, so the
// LLM script-wiring step (and a human reviewer) knows what the data means and
// how the lab wants it handled — not just the script source + a filename.
export interface PipelineDataContext {
  pipeline_description: string | null;
  data_table: {
    name: string;
    description: string | null;
    data_processing_instructions: string | null;
    columns: { label: string; field_type: string }[];
  } | null;
}

export interface RegisterPipelinePayload {
  pipeline_id: number;
  name: string;
  match_table: string | null; // null for target_kind = "drone_flight" pipelines
  sample_dataset_url: string;
  script_url: string;
  model_url: string | null;
  callback_url: string;
  data_context?: PipelineDataContext | null;
}

// Kicks off registration on the processing machine: it downloads the sample
// dataset/script/model, has the LLM wire the script into a runnable command,
// test-runs it against the sample dataset, and calls `callback_url` with the result.
export async function registerPipeline(
  payload: RegisterPipelinePayload
): Promise<{ external_pipeline_id: string }> {
  return processingFetch("/pipelines", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface TriggerRunPayload {
  run_id: number;
  callback_url: string;
  // Exactly one of these two — input_file_url for the normal upload-matched/re-test
  // path, drone_flight_record_id for a manual per-flight organize run (see
  // PipelineRun.target_drone_flight_id and Item90_Processing_Pipeline_Scope.md).
  input_file_url?: string;
  drone_flight_record_id?: number;
}

export async function triggerPipelineRun(
  externalPipelineId: string,
  payload: TriggerRunPayload
): Promise<{ external_job_id: string }> {
  return processingFetch(`/pipelines/${encodeURIComponent(externalPipelineId)}/run`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deletePipeline(externalPipelineId: string) {
  return processingFetch(`/pipelines/${encodeURIComponent(externalPipelineId)}`, {
    method: "DELETE",
  });
}
