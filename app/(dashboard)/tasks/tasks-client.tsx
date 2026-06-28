"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Plus, X } from "lucide-react";

export const CLASSIFICATIONS = [
  "image annotation", "ocr", "transcription", "categorization",
  "photogrammetric processing", "image classification", "spatial analysis",
  "data cleaning", "sampling", "drone flight", "tiling",
];
export const STATUSES   = ["not started", "in progress", "complete"];
export const PRIORITIES = ["low", "medium", "high"];

const PRIORITY_VARIANT: Record<string, "outline" | "secondary" | "default" | "destructive"> = {
  low: "outline", medium: "secondary", high: "destructive",
};
const STATUS_VARIANT: Record<string, "outline" | "secondary" | "default"> = {
  "not started": "outline", "in progress": "secondary", complete: "default",
};

export interface TaskRow {
  id: number;
  description: string;
  classification: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  experiment_id: number | null;
  experiment_name: string | null;
  farm_name: string | null;
  assignees: { id: string; name: string | null; email: string }[];
  upload_count: number;
  created_at: string;
  vikunja_task_id?: number | null;
}

interface ExperimentOption { id: number; name: string; }
interface UserOption { id: string; name: string; }

export function TasksClient({
  initialTasks, experiments, users, canCreate, canDelete, activeFilter,
}: {
  initialTasks: TaskRow[];
  experiments: ExperimentOption[];
  users: UserOption[];
  canCreate: boolean;
  canDelete: boolean;
  activeFilter?: { projectCount: number; farmCount: number } | null;
}) {
  const router = useRouter();
  const [tasks, setTasks]             = useState(initialTasks);
  const [search, setSearch]           = useState("");
  const [filterStatus, setFilterStatus]   = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterClass, setFilterClass]   = useState("all");
  const [showForm, setShowForm]         = useState(false);

  // Create form state
  const [desc, setDesc]           = useState("");
  const [cls, setCls]             = useState("");
  const [expId, setExpId]         = useState("");
  const [status, setStatus]       = useState("not started");
  const [priority, setPriority]   = useState("medium");
  const [dueDate, setDueDate]     = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState<string | null>(null);

  const filtered = useMemo(() => tasks.filter((t) => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (filterClass !== "all" && t.classification !== filterClass) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = [t.description, t.experiment_name, t.farm_name, ...t.assignees.map((a) => a.name ?? a.email)]
        .filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [tasks, filterStatus, filterPriority, filterClass, search]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: desc, classification: cls || null,
          experiment_id: expId ? parseInt(expId) : null,
          status, priority,
          due_date: dueDate || null,
          assignee_ids: assigneeIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error ?? "Failed"); return; }
      setTasks((prev) => [
        {
          id: data.id, description: data.description, classification: data.classification,
          status: data.status, priority: data.priority, due_date: data.due_date,
          experiment_id: data.experiment_id, experiment_name: null, farm_name: null,
          assignees: data.Assignees?.map((a: { User: { id: string; name: string | null; email: string } }) => ({
            id: a.User.id, name: a.User.name, email: a.User.email,
          })) ?? [],
          upload_count: 0, created_at: data.created_at,
        },
        ...prev,
      ]);
      setShowForm(false);
      setDesc(""); setCls(""); setExpId(""); setStatus("not started"); setPriority("medium"); setDueDate(""); setAssigneeIds([]);
      router.refresh();
    } catch { setFormError("Network error"); }
    finally { setSubmitting(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this task?")) return;
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    setTasks((prev) => prev.filter((t) => t.id !== id));
    router.refresh();
  }

  function toggleAssignee(userId: string) {
    setAssigneeIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  const overdue = (t: TaskRow) => t.due_date && new Date(t.due_date) < new Date() && t.status !== "complete";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Tasks</h2>
        {canCreate && (
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            {showForm ? <><X className="h-4 w-4 mr-1" />Cancel</> : <><Plus className="h-4 w-4 mr-1" />New Task</>}
          </Button>
        )}
      </div>

      {activeFilter && (activeFilter.projectCount > 0 || activeFilter.farmCount > 0) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Filtered to{" "}
          {activeFilter.projectCount > 0 && (
            <strong>{activeFilter.projectCount} project{activeFilter.projectCount !== 1 ? "s" : ""}</strong>
          )}
          {activeFilter.projectCount > 0 && activeFilter.farmCount > 0 && ", "}
          {activeFilter.farmCount > 0 && (
            <strong>{activeFilter.farmCount} farm{activeFilter.farmCount !== 1 ? "s" : ""}</strong>
          )}
          . Change in <strong>Dashboard Filters</strong> (header menu).
        </div>
      )}

      {showForm && (
        <Card>
          <CardContent className="pt-4">
            <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-sm font-medium text-slate-700">Description</label>
                <textarea
                  className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm min-h-[72px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  value={desc} onChange={(e) => setDesc(e.target.value)} required
                  placeholder="What needs to be done?"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Classification</label>
                <select value={cls} onChange={(e) => setCls(e.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-white px-2 text-sm">
                  <option value="">— none —</option>
                  {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Experiment</label>
                <select value={expId} onChange={(e) => setExpId(e.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-white px-2 text-sm">
                  <option value="">— none —</option>
                  {experiments.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-white px-2 text-sm">
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Priority</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-white px-2 text-sm">
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Due date</label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-8" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-sm font-medium text-slate-700">Assign to</label>
                <div className="flex flex-wrap gap-2">
                  {users.map((u) => (
                    <button key={u.id} type="button"
                      onClick={() => toggleAssignee(u.id)}
                      className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                        assigneeIds.includes(u.id)
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-white text-slate-600 border-slate-300 hover:border-slate-500"
                      }`}>
                      {u.name}
                    </button>
                  ))}
                </div>
              </div>
              {formError && <p className="col-span-2 text-sm text-red-600">{formError}</p>}
              <div className="col-span-2 flex gap-2">
                <Button type="submit" size="sm" disabled={submitting}>
                  {submitting ? "Creating…" : "Create Task"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-52" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="h-8 rounded-md border border-input bg-white px-2 text-sm">
          <option value="all">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}
          className="h-8 rounded-md border border-input bg-white px-2 text-sm">
          <option value="all">All Priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)}
          className="h-8 rounded-md border border-input bg-white px-2 text-sm">
          <option value="all">All Types</option>
          {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="ml-auto text-sm text-slate-500">{filtered.length} of {tasks.length}</span>
      </div>

      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Experiment</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead>Files</TableHead>
              {canDelete && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canDelete ? 9 : 8} className="text-center text-slate-500 py-8">
                  No tasks found
                </TableCell>
              </TableRow>
            ) : filtered.map((t) => (
              <TableRow key={t.id} className="cursor-pointer hover:bg-slate-50"
                onClick={() => router.push(`/tasks/${t.id}`)}>
                <TableCell className="font-medium max-w-xs">
                  <span className="line-clamp-2">{t.description}</span>
                </TableCell>
                <TableCell>
                  {t.classification
                    ? <Badge variant="outline" className="text-xs">{t.classification}</Badge>
                    : <span className="text-slate-400">—</span>}
                </TableCell>
                <TableCell className="text-sm">
                  {t.experiment_name
                    ? <span>{t.experiment_name}{t.farm_name ? <span className="text-slate-400"> / {t.farm_name}</span> : null}</span>
                    : <span className="text-slate-400">—</span>}
                </TableCell>
                <TableCell>
                  <Badge variant={PRIORITY_VARIANT[t.priority] ?? "outline"}>{t.priority}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[t.status] ?? "outline"}>{t.status}</Badge>
                </TableCell>
                <TableCell className={`text-sm ${overdue(t) ? "text-red-600 font-medium" : "text-slate-500"}`}>
                  {t.due_date ? new Date(t.due_date + "T00:00:00").toLocaleDateString() : "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {t.assignees.length === 0
                    ? <span className="text-slate-400">—</span>
                    : <span>{t.assignees.map((a) => a.name ?? a.email).join(", ")}</span>}
                </TableCell>
                <TableCell className="text-sm text-slate-500">{t.upload_count || "—"}</TableCell>
                {canDelete && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-red-500 hover:text-red-700"
                      onClick={() => handleDelete(t.id)}>
                      ×
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
