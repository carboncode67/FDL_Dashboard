"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const STATUS_VARIANT: Record<string, "outline" | "secondary" | "default" | "destructive"> = {
  queued: "secondary", running: "secondary", success: "default", failed: "destructive",
};

export interface PipelineRunRow {
  id: number;
  pipeline_id: number;
  pipeline_name: string;
  farm_id: number | null;
  farm_name: string | null;
  is_test_run: boolean;
  status: string;
  prompt: string | null;
  processor_note: string | null;
  error_message: string | null;
  output_files: { filename: string; download_url: string }[];
  output_storage_path: string | null;
  stdout_log: string | null;
  stderr_log: string | null;
  trigger_upload_table: string | null;
  trigger_data_table_id: number | null;
  target_drone_flight_id: number | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

function triggerLabel(r: PipelineRunRow): string {
  if (r.target_drone_flight_id) return `drone flight #${r.target_drone_flight_id}`;
  if (r.trigger_data_table_id) return "data table upload";
  if (r.trigger_upload_table) return r.trigger_upload_table;
  if (r.is_test_run) return "test run";
  return "—";
}

export function PipelineRunsClient({ runs, isAdmin }: { runs: PipelineRunRow[]; isAdmin: boolean }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [promptForId, setPromptForId] = useState<number | null>(null);
  const [promptText, setPromptText] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function rerun(runId: number, prompt?: string) {
    setBusyId(runId);
    setError(null);
    try {
      const res = await fetch(`/api/pipelines/runs/${runId}/rerun`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prompt ? { prompt } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Failed to start run"); return; }
      setPromptForId(null);
      setPromptText("");
      router.refresh();
    } catch { setError("Network error"); }
    finally { setBusyId(null); }
  }

  if (runs.length === 0) {
    return <p className="text-sm text-slate-500 py-8 text-center">No pipeline runs yet.</p>;
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pipeline</TableHead>
              <TableHead>Farm</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>When</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((r) => (
              <Fragment key={r.id}>
                <TableRow className="cursor-pointer hover:bg-slate-50" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                  <TableCell className="font-medium">{r.pipeline_name}</TableCell>
                  <TableCell className="text-sm">
                    {r.farm_name ? (
                      <a href={`/farms/${r.farm_id}`} className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                        {r.farm_name}
                      </a>
                    ) : (
                      <span className="text-slate-400 italic">No Farm Associated</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {triggerLabel(r)}
                    {r.prompt && <Badge variant="outline" className="ml-2 text-xs">prompted</Badge>}
                  </TableCell>
                  <TableCell><Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>{r.status}</Badge></TableCell>
                  <TableCell className="text-sm text-slate-500">
                    {new Date(r.finished_at ?? r.started_at ?? r.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {isAdmin && (
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => rerun(r.id)}>
                          {busyId === r.id ? "…" : "Rerun"}
                        </Button>
                        <Button size="sm" variant="outline" disabled={busyId === r.id}
                          onClick={() => { setPromptForId(promptForId === r.id ? null : r.id); setPromptText(r.prompt ?? ""); }}>
                          Prompt
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>

                {promptForId === r.id && (
                  <TableRow>
                    <TableCell colSpan={6} className="bg-slate-50">
                      <div className="space-y-2 py-1">
                        <p className="text-xs text-slate-500">
                          Re-run with an instruction for the processing model — it re-wires the script for this run only.
                        </p>
                        <textarea
                          value={promptText}
                          onChange={(e) => setPromptText(e.target.value)}
                          placeholder='e.g. "Set output raster resolution to 5 m instead of the default."'
                          className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm min-h-[60px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" disabled={busyId === r.id || !promptText.trim()}
                            onClick={() => rerun(r.id, promptText.trim())}>
                            {busyId === r.id ? "Starting…" : "Rerun with prompt"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setPromptForId(null)}>Cancel</Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}

                {expanded === r.id && (
                  <TableRow>
                    <TableCell colSpan={6} className="bg-slate-50">
                      <div className="space-y-3 py-2 text-sm">
                        {r.prompt && (
                          <div>
                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Prompt</p>
                            <p className="whitespace-pre-wrap">{r.prompt}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Processor Note</p>
                          <p className={r.processor_note ? "whitespace-pre-wrap" : "text-slate-400 italic"}>
                            {r.processor_note ?? "none"}
                          </p>
                        </div>
                        {r.error_message && (
                          <div>
                            <p className="text-xs font-medium text-red-600 uppercase tracking-wide">Error</p>
                            <p className="whitespace-pre-wrap text-red-700">{r.error_message}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Data Outputs</p>
                          {r.output_files.length === 0 && !r.output_storage_path ? (
                            <p className="text-slate-400 italic">no outputs</p>
                          ) : (
                            <ul className="list-disc list-inside space-y-0.5">
                              {r.output_files.map((f, i) => (
                                <li key={i}>
                                  <a href={f.download_url} className="text-blue-600 hover:underline" target="_blank" rel="noreferrer">
                                    {f.filename}
                                  </a>
                                </li>
                              ))}
                              {r.output_storage_path && <li className="text-slate-600">stored at <code>{r.output_storage_path}</code></li>}
                            </ul>
                          )}
                        </div>
                        {(r.stdout_log || r.stderr_log) && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-slate-500">logs</summary>
                            {r.stdout_log && <pre className="mt-1 overflow-x-auto rounded bg-slate-900 text-slate-100 p-2">{r.stdout_log}</pre>}
                            {r.stderr_log && <pre className="mt-1 overflow-x-auto rounded bg-slate-900 text-amber-200 p-2">{r.stderr_log}</pre>}
                          </details>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
