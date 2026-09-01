"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, X } from "lucide-react";

export const MATCH_TABLES = [
  "photos", "notes", "recordings", "locations", "lab-member-uploads", "test-data-rows", "documents",
];

const STATUS_VARIANT: Record<string, "outline" | "secondary" | "default" | "destructive"> = {
  draft: "outline", testing: "secondary", live: "default", failed: "destructive", disabled: "outline",
};

export interface PipelineRow {
  id: number;
  name: string;
  description: string | null;
  status: string;
  target_kind: string | null;
  match_table: string | null;
  match_category: string | null;
  match_project_id: number | null;
  match_data_table_id: number | null;
  wired_command: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  creator_name: string;
  run_count: number;
  created_at: string;
}

interface ProjectOption { id: number; name: string; }
interface DataTableOption { id: number; name: string; }

export function PipelinesClient({
  initialPipelines, projects, dataTables, isAdmin,
}: {
  initialPipelines: PipelineRow[];
  projects: ProjectOption[];
  dataTables: DataTableOption[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pipelines, setPipelines] = useState(initialPipelines);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isDroneFlightTarget, setIsDroneFlightTarget] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setWarning(null);
    try {
      const formData = new FormData(e.currentTarget);
      const res = await fetch("/api/pipelines", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error ?? "Failed"); return; }
      if (data.warning) setWarning(data.warning);
      setPipelines((prev) => [
        {
          id: data.id, name: data.name, description: data.description, status: data.status,
          target_kind: data.target_kind, match_table: data.match_table, match_category: data.match_category,
          match_project_id: data.match_project_id, match_data_table_id: data.match_data_table_id,
          wired_command: data.wired_command, last_run_at: null, last_run_status: null,
          creator_name: "you", run_count: 0, created_at: data.created_at,
        },
        ...prev,
      ]);
      setShowForm(false);
      setIsDroneFlightTarget(false);
      formRef.current?.reset();
      router.refresh();
    } catch { setFormError("Network error"); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Pipelines</h2>
          <p className="text-sm text-slate-500">
            Automated data-processing pipelines: upload a sample dataset + script (+ optional model),
            an LLM wires it up on the processing machine, and it auto-runs on every future matching upload.
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            {showForm ? <><X className="h-4 w-4 mr-1" />Cancel</> : <><Plus className="h-4 w-4 mr-1" />New Pipeline</>}
          </Button>
        )}
      </div>

      {warning && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {warning}
        </div>
      )}

      {showForm && (
        <Card>
          <CardContent className="pt-4">
            <form ref={formRef} onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Name</label>
                <Input name="name" required placeholder="e.g. Dualex kriging interpolation" />
              </div>
              <div className="flex items-end pb-1.5">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="target_kind"
                    value="drone_flight"
                    checked={isDroneFlightTarget}
                    onChange={(e) => setIsDroneFlightTarget(e.target.checked)}
                  />
                  Organizes drone imagery — run manually per flight
                </label>
              </div>
              <div className="sm:col-span-2 space-y-1">
                <label className="text-sm font-medium text-slate-700">Description</label>
                <textarea name="description"
                  className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm min-h-[60px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="What does this pipeline do?" />
              </div>
              {isDroneFlightTarget ? (
                <div className="sm:col-span-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  This pipeline has no match table — it never auto-triggers on uploads. Imagery is
                  copied directly onto the processing machine's landing folder for a chosen drone
                  flight, then run manually from that flight's "Run" button. Output is written to
                  zraid1 and the flight record's storage path is filled in automatically.
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Match table</label>
                    <select name="match_table" required defaultValue=""
                      className="h-8 w-full rounded-md border border-input bg-white px-2 text-sm">
                      <option value="" disabled>— choose —</option>
                      {MATCH_TABLES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Category filter (optional)</label>
                    <Input name="match_category" placeholder="leave blank to match any category" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Project scope (optional)</label>
                    <select name="match_project_id" defaultValue=""
                      className="h-8 w-full rounded-md border border-input bg-white px-2 text-sm">
                      <option value="">— any project —</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Table scope (optional)</label>
                    <select name="match_data_table_id" defaultValue=""
                      className="h-8 w-full rounded-md border border-input bg-white px-2 text-sm">
                      <option value="">— any table —</option>
                      {dataTables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                </>
              )}
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">
                  Sample dataset{isDroneFlightTarget ? " (.zip of sample images)" : ""}
                </label>
                <input type="file" name="sample_dataset" required
                  className="w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm" />
                {isDroneFlightTarget && (
                  <p className="text-xs text-slate-500">
                    Upload a .zip of a handful of sample images — it's extracted into a folder
                    on the processing machine so the wired script can be tested against a
                    directory, same shape as a real flight's landing folder.
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Script (.py)</label>
                <input type="file" name="script" accept=".py" required
                  className="w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Model weights (optional)</label>
                <input type="file" name="model" accept=".safetensors,.pt,.pth"
                  className="w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm" />
              </div>
              {formError && <p className="sm:col-span-2 text-sm text-red-600">{formError}</p>}
              <div className="sm:col-span-2 flex gap-2">
                <Button type="submit" size="sm" disabled={submitting}>
                  {submitting ? "Uploading…" : "Create Pipeline"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Matches</TableHead>
              <TableHead>Last Run</TableHead>
              <TableHead>Runs</TableHead>
              <TableHead>Created By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pipelines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-slate-500 py-8">
                  No pipelines yet
                </TableCell>
              </TableRow>
            ) : pipelines.map((p) => (
              <TableRow key={p.id} className="cursor-pointer hover:bg-slate-50"
                onClick={() => router.push(`/pipelines/${p.id}`)}>
                <TableCell className="font-medium max-w-xs">
                  <span className="line-clamp-2">{p.name}</span>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[p.status] ?? "outline"}>{p.status}</Badge>
                </TableCell>
                <TableCell className="text-sm text-slate-600">
                  {p.target_kind === "drone_flight" ? (
                    "drone flight (manual)"
                  ) : (
                    <>
                      {p.match_table}
                      {p.match_category ? ` / ${p.match_category}` : ""}
                    </>
                  )}
                </TableCell>
                <TableCell className="text-sm text-slate-500">
                  {p.last_run_at ? new Date(p.last_run_at).toLocaleString() : "—"}
                  {p.last_run_status ? ` (${p.last_run_status})` : ""}
                </TableCell>
                <TableCell className="text-sm text-slate-500">{p.run_count}</TableCell>
                <TableCell className="text-sm text-slate-500">{p.creator_name}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
