"use client";

import { Fragment, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { MATCH_TABLES } from "../pipelines-client";
import { X } from "lucide-react";

const MATCH_TABLE_LABELS: Record<string, string> = {
  "test-data-rows": "Sample Data Upload (a Data Table)",
  "lab-member-uploads": "lab member uploads",
};

const STATUS_VARIANT: Record<string, "outline" | "secondary" | "default" | "destructive"> = {
  draft: "outline", testing: "secondary", live: "default", failed: "destructive", disabled: "outline",
  queued: "secondary", running: "secondary", success: "default",
};

export interface PipelineRunRow {
  id: number;
  is_test_run: boolean;
  status: string;
  stdout_log: string | null;
  stderr_log: string | null;
  output_files: { filename: string; download_url: string }[];
  output_storage_path: string | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface DroneFlightOption {
  id: number;
  label: string;
}

interface ProjectOption { id: number; name: string; }
interface DataTableOption {
  id: number;
  name: string;
  description: string | null;
  columnCount: number;
  hasSample: boolean;
}

export interface PipelineDetail {
  id: number;
  name: string;
  description: string | null;
  status: string;
  target_kind: string | null;
  match_table: string | null;
  match_category: string | null;
  match_project_id: number | null;
  match_data_table_id: number | null;
  use_spatial_context: boolean;
  sample_dataset_original_name: string;
  sample_dataset_filename: string;
  script_original_name: string;
  script_filename: string;
  model_original_name: string | null;
  model_filename: string | null;
  wired_command: string | null;
  wired_requirements: string | null;
  llm_notes: string | null;
  external_pipeline_id: string | null;
  creator_name: string;
  created_at: string;
  runs: PipelineRunRow[];
}

export function PipelineDetailClient({
  pipeline, droneFlights, projects, dataTables, isAdmin,
}: {
  pipeline: PipelineDetail;
  droneFlights: DroneFlightOption[];
  projects: ProjectOption[];
  dataTables: DataTableOption[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(pipeline.status);
  const [busy, setBusy] = useState(false);
  const [expandedRun, setExpandedRun] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isDroneFlightTarget = pipeline.target_kind === "drone_flight";
  const [selectedDroneFlightId, setSelectedDroneFlightId] = useState<string>("");

  const [editing, setEditing] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editWarning, setEditWarning] = useState<string | null>(null);
  const [editMatchTable, setEditMatchTable] = useState(pipeline.match_table ?? "");
  const [editDataTableId, setEditDataTableId] = useState(
    pipeline.match_data_table_id ? String(pipeline.match_data_table_id) : ""
  );
  const editFormRef = useRef<HTMLFormElement>(null);
  const editDataTableRequired = editMatchTable === "test-data-rows";
  const selectedEditDataTable = dataTables.find((t) => String(t.id) === editDataTableId) ?? null;

  async function handleRun() {
    if (isDroneFlightTarget && !selectedDroneFlightId) {
      setError("Choose a drone flight to run against first");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/pipelines/${pipeline.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isDroneFlightTarget ? { drone_flight_record_id: Number(selectedDroneFlightId) } : {}
        ),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to start run"); return; }
      router.refresh();
    } catch { setError("Network error"); }
    finally { setBusy(false); }
  }

  async function toggleEnabled() {
    const next = status === "disabled" ? "live" : "disabled";
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/pipelines/${pipeline.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed"); return; }
      setStatus(data.status);
      router.refresh();
    } catch { setError("Network error"); }
    finally { setBusy(false); }
  }

  async function handleDelete() {
    if (!confirm(`Delete pipeline "${pipeline.name}"? This cannot be undone.`)) return;
    await fetch(`/api/pipelines/${pipeline.id}`, { method: "DELETE" });
    router.push("/pipelines");
  }

  async function handleEditSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (editDataTableRequired && !editDataTableId) {
      setEditError("Pick the Data Table this pipeline processes — a Sample Data Upload trigger fires only for that table's data.");
      return;
    }
    setEditBusy(true);
    setEditError(null);
    setEditWarning(null);
    try {
      const formData = new FormData(e.currentTarget);
      const res = await fetch(`/api/pipelines/${pipeline.id}/edit`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) { setEditError(data.error ?? "Failed"); return; }
      if (data.warning) setEditWarning(data.warning);
      setStatus(data.status);
      setEditing(false);
      router.refresh();
    } catch { setEditError("Network error"); }
    finally { setEditBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{pipeline.name}</h2>
          {pipeline.description && <p className="text-sm text-slate-500 mt-1">{pipeline.description}</p>}
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[status] ?? "outline"}>{status}</Badge>
            <span className="text-sm text-slate-500">
              {isDroneFlightTarget ? (
                "drone flight — run manually per flight, never auto-triggered"
              ) : (
                <>
                  matches {pipeline.match_table}
                  {pipeline.match_category ? ` / ${pipeline.match_category}` : ""}
                </>
              )}
            </span>
            {pipeline.use_spatial_context && (
              <Badge variant="outline" className="text-xs">uses spatial context</Badge>
            )}
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {isDroneFlightTarget && (
              <select
                value={selectedDroneFlightId}
                onChange={(e) => setSelectedDroneFlightId(e.target.value)}
                className="h-8 rounded-md border border-input bg-white px-2 text-sm"
              >
                <option value="">— choose flight —</option>
                {droneFlights.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            )}
            <Button size="sm" variant="outline" onClick={handleRun} disabled={busy || !pipeline.external_pipeline_id}>
              {isDroneFlightTarget ? "Run for flight" : "Run manually"}
            </Button>
            <Button size="sm" variant="outline" onClick={toggleEnabled} disabled={busy || status === "draft" || status === "testing"}>
              {status === "disabled" ? "Enable" : "Disable"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
              {editing ? <><X className="h-4 w-4 mr-1" />Cancel</> : "Edit"}
            </Button>
            <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {editing && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <p className="text-sm text-slate-500">
              Editing always re-registers with the processing machine — the script (existing or
              newly uploaded) is re-wired and test-run again against the sample dataset. This is
              also how to recover a pipeline stuck at <Badge variant="destructive" className="mx-1">failed</Badge>
              after fixing a script bug: fix the file, re-upload it here, save.
            </p>
            <form ref={editFormRef} onSubmit={handleEditSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Name</label>
                <Input name="name" defaultValue={pipeline.name} required />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <label className="text-sm font-medium text-slate-700">Description</label>
                <textarea name="description" defaultValue={pipeline.description ?? ""}
                  className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm min-h-[60px] resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>

              {!isDroneFlightTarget && (
                <>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Trigger on (upload type)</label>
                    <select name="match_table" required value={editMatchTable}
                      onChange={(e) => setEditMatchTable(e.target.value)}
                      className="h-8 w-full rounded-md border border-input bg-white px-2 text-sm">
                      {MATCH_TABLES.map((t) => <option key={t} value={t}>{MATCH_TABLE_LABELS[t] ?? t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Category filter (optional)</label>
                    <Input name="match_category" defaultValue={pipeline.match_category ?? ""} placeholder="leave blank to match any category" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Project scope (optional)</label>
                    <select name="match_project_id" defaultValue={pipeline.match_project_id ? String(pipeline.match_project_id) : ""}
                      className="h-8 w-full rounded-md border border-input bg-white px-2 text-sm">
                      <option value="">— any project —</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">
                      Data Table {editDataTableRequired ? <span className="text-red-500">*</span> : "(optional)"}
                    </label>
                    <select name="match_data_table_id"
                      required={editDataTableRequired}
                      value={editDataTableId}
                      onChange={(e) => setEditDataTableId(e.target.value)}
                      className="h-8 w-full rounded-md border border-input bg-white px-2 text-sm">
                      <option value="">{editDataTableRequired ? "— choose a table —" : "— any table —"}</option>
                      {dataTables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    {selectedEditDataTable && (
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        {selectedEditDataTable.columnCount} column{selectedEditDataTable.columnCount === 1 ? "" : "s"} defined
                      </div>
                    )}
                  </div>
                  <div className="flex items-end pb-1.5">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" name="use_spatial_context" defaultChecked={pipeline.use_spatial_context} />
                      Uses spatial context
                    </label>
                  </div>
                </>
              )}

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Replace sample dataset (optional)</label>
                <p className="text-xs text-slate-500">Currently: {pipeline.sample_dataset_original_name}</p>
                <input type="file" name="sample_dataset" className="text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Replace script (optional)</label>
                <p className="text-xs text-slate-500">Currently: {pipeline.script_original_name}</p>
                <input type="file" name="script" className="text-sm" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-sm font-medium text-slate-700">Replace model weights (optional)</label>
                <p className="text-xs text-slate-500">
                  {pipeline.model_original_name ? `Currently: ${pipeline.model_original_name}` : "No model file attached"}
                </p>
                <input type="file" name="model" className="text-sm" />
              </div>

              {editError && <p className="sm:col-span-2 text-sm text-red-600">{editError}</p>}
              {editWarning && <p className="sm:col-span-2 text-sm text-amber-700">{editWarning}</p>}

              <div className="sm:col-span-2 flex justify-end">
                <Button type="submit" disabled={editBusy}>
                  {editBusy ? "Saving & re-registering…" : "Save & re-register"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4 space-y-2 text-sm">
          <div><span className="font-medium text-slate-700">Sample dataset:</span>{" "}
            <a className="text-emerald-700 hover:underline" href={`/api/files/pipeline-datasets/${pipeline.sample_dataset_filename}`} target="_blank" rel="noreferrer">
              {pipeline.sample_dataset_original_name}
            </a>
          </div>
          <div><span className="font-medium text-slate-700">Script:</span>{" "}
            <a className="text-emerald-700 hover:underline" href={`/api/files/pipeline-scripts/${pipeline.script_filename}`} target="_blank" rel="noreferrer">
              {pipeline.script_original_name}
            </a>
          </div>
          {pipeline.model_filename && (
            <div><span className="font-medium text-slate-700">Model:</span>{" "}
              <a className="text-emerald-700 hover:underline" href={`/api/files/pipeline-models/${pipeline.model_filename}`} target="_blank" rel="noreferrer">
                {pipeline.model_original_name}
              </a>
            </div>
          )}
          {pipeline.wired_command && (
            <div>
              <span className="font-medium text-slate-700">Wired command:</span>{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{pipeline.wired_command}</code>
            </div>
          )}
          {pipeline.llm_notes && (
            <div>
              <span className="font-medium text-slate-700">LLM notes:</span>
              <p className="mt-1 whitespace-pre-wrap text-slate-600">{pipeline.llm_notes}</p>
            </div>
          )}
          <div className="text-slate-500">Created by {pipeline.creator_name} on {new Date(pipeline.created_at).toLocaleDateString()}</div>
        </CardContent>
      </Card>

      <h3 className="text-lg font-semibold text-slate-900">Run history</h3>
      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Finished</TableHead>
              <TableHead>Outputs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pipeline.runs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-slate-500 py-8">No runs yet</TableCell>
              </TableRow>
            ) : pipeline.runs.map((r) => (
              <Fragment key={r.id}>
                <TableRow className="cursor-pointer hover:bg-slate-50"
                  onClick={() => setExpandedRun(expandedRun === r.id ? null : r.id)}>
                  <TableCell><Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>{r.status}</Badge></TableCell>
                  <TableCell className="text-sm text-slate-600">{r.is_test_run ? "test" : "triggered"}</TableCell>
                  <TableCell className="text-sm text-slate-500">{r.started_at ? new Date(r.started_at).toLocaleString() : "—"}</TableCell>
                  <TableCell className="text-sm text-slate-500">{r.finished_at ? new Date(r.finished_at).toLocaleString() : "—"}</TableCell>
                  <TableCell className="text-sm text-slate-500">{r.output_files.length || "—"}</TableCell>
                </TableRow>
                {expandedRun === r.id && (
                  <TableRow key={`${r.id}-detail`}>
                    <TableCell colSpan={5} className="bg-slate-50 text-xs space-y-2">
                      {r.error_message && <p className="text-red-600">{r.error_message}</p>}
                      {r.output_storage_path && (
                        <p className="text-slate-700">
                          Written to zraid1: <code className="rounded bg-white border px-1.5 py-0.5">{r.output_storage_path}</code>
                        </p>
                      )}
                      {r.stdout_log && (
                        <div>
                          <p className="font-medium text-slate-700">stdout</p>
                          <pre className="whitespace-pre-wrap rounded bg-white border p-2 max-h-64 overflow-auto">{r.stdout_log}</pre>
                        </div>
                      )}
                      {r.stderr_log && (
                        <div>
                          <p className="font-medium text-slate-700">stderr</p>
                          <pre className="whitespace-pre-wrap rounded bg-white border p-2 max-h-64 overflow-auto">{r.stderr_log}</pre>
                        </div>
                      )}
                      {r.output_files.length > 0 && (
                        <div>
                          <p className="font-medium text-slate-700">Outputs</p>
                          <ul className="list-disc list-inside">
                            {r.output_files.map((f) => (
                              <li key={f.filename}>
                                <a className="text-emerald-700 hover:underline" href={f.download_url} target="_blank" rel="noreferrer">{f.filename}</a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
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
