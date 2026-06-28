"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, X, ChevronDown } from "lucide-react";
import { CLASSIFICATIONS, STATUSES, PRIORITIES } from "@/app/(dashboard)/tasks/tasks-client";

interface UserOption { id: string; name: string | null; email: string }
interface TemplateOption { id: number; description: string; classification: string | null; priority: string }

export interface ExperimentTaskRow {
  id: number;
  description: string;
  classification: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  assignees: { id: string; name: string | null; email: string }[];
  created_at: string;
}

const PRIORITY_VARIANT: Record<string, "outline" | "secondary" | "default" | "destructive"> = {
  low: "outline", medium: "secondary", high: "destructive",
};
const STATUS_VARIANT: Record<string, "outline" | "secondary" | "default"> = {
  "not started": "outline", "in progress": "secondary", complete: "default",
};

export function ExperimentTasksSection({
  experimentId, users, initialTasks, templates,
}: {
  experimentId: number;
  users: UserOption[];
  initialTasks: ExperimentTaskRow[];
  templates: TemplateOption[];
}) {
  const router = useRouter();
  const [tasks, setTasks]           = useState(initialTasks);
  const [showForm, setShowForm]     = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  // form state
  const [desc, setDesc]             = useState("");
  const [cls, setCls]               = useState("");
  const [status, setStatus]         = useState("not started");
  const [priority, setPriority]     = useState("medium");
  const [dueDate, setDueDate]       = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState<string | null>(null);

  function openBlankForm() {
    setDesc(""); setCls(""); setStatus("not started"); setPriority("medium");
    setDueDate(""); setAssigneeIds([]); setFormError(null);
    setShowTemplates(false);
    setShowForm(true);
  }

  function applyTemplate(t: TemplateOption) {
    setDesc(t.description);
    setCls(t.classification ?? "");
    setPriority(t.priority);
    setStatus("not started");
    setDueDate(""); setAssigneeIds([]); setFormError(null);
    setShowTemplates(false);
    setShowForm(true);
  }

  function toggleAssignee(userId: string) {
    setAssigneeIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  function cancelForm() {
    setShowForm(false);
    setShowTemplates(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: desc,
          classification: cls || null,
          experiment_id: experimentId,
          status,
          priority,
          due_date: dueDate || null,
          assignee_ids: assigneeIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error ?? "Failed to create task"); return; }
      setTasks((prev) => [
        {
          id: data.id,
          description: data.description,
          classification: data.classification,
          status: data.status,
          priority: data.priority,
          due_date: data.due_date,
          assignees: data.Assignees?.map((a: { User: UserOption }) => ({
            id: a.User.id, name: a.User.name, email: a.User.email,
          })) ?? [],
          created_at: data.created_at,
        },
        ...prev,
      ]);
      setShowForm(false);
      router.refresh();
    } catch { setFormError("Network error"); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-4 mt-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Tasks</h3>
        <div className="flex items-center gap-2">
          {templates.length > 0 && (
            <div className="relative">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { setShowTemplates((v) => !v); setShowForm(false); }}
              >
                From Template <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
              {showTemplates && (
                <div className="absolute right-0 mt-1 z-10 w-72 rounded-md border bg-white shadow-md">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => applyTemplate(t)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b last:border-b-0"
                    >
                      <span className="font-medium">{t.description}</span>
                      {t.classification && (
                        <span className="ml-2 text-xs text-slate-500">{t.classification}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <Button type="button" size="sm" onClick={showForm ? cancelForm : openBlankForm}>
            {showForm ? <><X className="h-4 w-4 mr-1" />Cancel</> : <><Plus className="h-4 w-4 mr-1" />New Task</>}
          </Button>
        </div>
      </div>

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
                      {u.name ?? u.email}
                    </button>
                  ))}
                </div>
              </div>
              {formError && <p className="col-span-2 text-sm text-red-600">{formError}</p>}
              <div className="col-span-2 flex gap-2">
                <Button type="submit" size="sm" disabled={submitting}>
                  {submitting ? "Creating…" : "Create Task"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={cancelForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {tasks.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Description</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Classification</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Status</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Priority</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Due</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Assignees</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tasks.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <Link href={`/tasks/${t.id}`} className="font-medium text-slate-900 hover:text-emerald-700 hover:underline">
                      {t.description}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{t.classification ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Badge variant={STATUS_VARIANT[t.status] ?? "outline"}>{t.status}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={PRIORITY_VARIANT[t.priority] ?? "outline"}>{t.priority}</Badge>
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {t.due_date ? new Date(t.due_date).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {t.assignees.length > 0
                      ? t.assignees.map((a) => a.name ?? a.email).join(", ")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !showForm && (
          <p className="text-sm text-slate-400 italic">No tasks linked to this experiment yet.</p>
        )
      )}
    </div>
  );
}
