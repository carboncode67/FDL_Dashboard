"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, ArrowLeft } from "lucide-react";
import { CLASSIFICATIONS, STATUSES, PRIORITIES, type TaskRow } from "../tasks-client";

interface PickerItem {
  upload_id: number;
  upload_table: "photos" | "lab-member-uploads";
  filename: string;
  category: string | null;
  farm_name: string | null;
  project_id: number | null;
  project_name: string | null;
  received_at: string;
  linked: boolean;
}

const PRIORITY_VARIANT: Record<string, "outline" | "secondary" | "default" | "destructive"> = {
  low: "outline", medium: "secondary", high: "destructive",
};
const STATUS_VARIANT: Record<string, "outline" | "secondary" | "default"> = {
  "not started": "outline", "in progress": "secondary", complete: "default",
};

export function TaskDetailClient({
  task: initialTask, experiments, users, pickerItems: initialPickerItems, projects, canEdit, canDelete,
}: {
  task: TaskRow;
  experiments: { id: number; name: string }[];
  users: { id: string; name: string }[];
  pickerItems: PickerItem[];
  projects: { id: number; name: string }[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [task, setTask] = useState(initialTask);
  const [pickerItems, setPickerItems] = useState(initialPickerItems);
  const [editing, setEditing]   = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  // Edit form state (mirroring task fields)
  const [desc, setDesc]         = useState(task.description);
  const [cls, setCls]           = useState(task.classification ?? "");
  const [expId, setExpId]       = useState(task.experiment_id ? String(task.experiment_id) : "");
  const [status, setStatus]     = useState(task.status);
  const [priority, setPriority] = useState(task.priority);
  const [dueDate, setDueDate]   = useState(task.due_date ?? "");
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // CVAT send state
  const [cvatLabels, setCvatLabels]   = useState("");
  const [sendingCvat, setSendingCvat] = useState(false);
  const [cvatResult, setCvatResult]   = useState<{ cvat_url?: string; image_count?: number; warning?: string; message?: string; cvat_configured?: boolean } | null>(null);
  const [showCvatForm, setShowCvatForm] = useState(false);

  // Upload picker state
  const [pickerSearch, setPickerSearch]   = useState("");
  const [pickerProject, setPickerProject] = useState("all");
  const [pickerFarm, setPickerFarm]       = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [linking, setLinking]   = useState(false);

  const farms = useMemo(() => {
    const set = new Set(initialPickerItems.map((i) => i.farm_name).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [initialPickerItems]);

  const filteredPicker = useMemo(() => pickerItems.filter((i) => {
    if (pickerProject !== "all" && String(i.project_id) !== pickerProject) return false;
    if (pickerFarm !== "all" && i.farm_name !== pickerFarm) return false;
    if (pickerSearch) {
      const q = pickerSearch.toLowerCase();
      if (![i.filename, i.category, i.farm_name, i.project_name].filter(Boolean).join(" ").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [pickerItems, pickerProject, pickerFarm, pickerSearch]);

  const linkedItems  = pickerItems.filter((i) => i.linked);
  const itemKey = (i: PickerItem) => `${i.upload_table}-${i.upload_id}`;

  function toggleSelected(item: PickerItem) {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = itemKey(item);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      filteredPicker.filter((i) => !i.linked).forEach((i) => next.add(itemKey(i)));
      return next;
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaveError(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: desc, classification: cls || null,
          experiment_id: expId ? parseInt(expId) : null,
          status, priority, due_date: dueDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setSaveError(data.error ?? "Failed"); return; }
      setTask((prev) => ({ ...prev, description: desc, classification: cls || null,
        status, priority, due_date: dueDate || null, experiment_id: expId ? parseInt(expId) : null }));
      setEditing(false);
      router.refresh();
    } catch { setSaveError("Network error"); }
    finally { setSaving(false); }
  }

  async function handleToggleAssignee(userId: string, isAssigned: boolean) {
    if (isAssigned) {
      await fetch(`/api/tasks/${task.id}/assignees`, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: userId }),
      });
      setTask((prev) => ({ ...prev, assignees: prev.assignees.filter((a) => a.id !== userId) }));
    } else {
      const res = await fetch(`/api/tasks/${task.id}/assignees`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_ids: [userId] }),
      });
      if (res.ok) {
        const u = users.find((u) => u.id === userId);
        if (u) setTask((prev) => ({ ...prev, assignees: [...prev.assignees, { id: u.id, name: u.name, email: "" }] }));
      }
    }
  }

  async function handleLinkUploads() {
    setLinking(true);
    const links = Array.from(selected).map((k) => {
      const lastDash = k.lastIndexOf("-");
      // key format: "photos-123" or "lab-member-uploads-456"
      // find the item
      const item = pickerItems.find((i) => itemKey(i) === k)!;
      return { upload_id: item.upload_id, upload_table: item.upload_table };
    });
    const res = await fetch(`/api/tasks/${task.id}/uploads`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ links }),
    });
    if (res.ok) {
      setPickerItems((prev) => prev.map((i) => selected.has(itemKey(i)) ? { ...i, linked: true } : i));
      setTask((prev) => ({ ...prev, upload_count: prev.upload_count + selected.size }));
      setSelected(new Set());
    }
    setLinking(false);
  }

  async function handleUnlink(item: PickerItem) {
    await fetch(`/api/tasks/${task.id}/uploads`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ links: [{ upload_id: item.upload_id, upload_table: item.upload_table }] }),
    });
    setPickerItems((prev) => prev.map((i) => itemKey(i) === itemKey(item) ? { ...i, linked: false } : i));
    setTask((prev) => ({ ...prev, upload_count: prev.upload_count - 1 }));
  }

  async function handleDeleteTask() {
    if (!confirm("Delete this task?")) return;
    await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    router.push("/tasks");
  }

  async function handleSendToCvat(e: React.FormEvent) {
    e.preventDefault();
    setSendingCvat(true);
    setCvatResult(null);
    const labelSet = cvatLabels
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((name) => ({ name, type: "polygon" as const }));
    try {
      const res = await fetch(`/api/tasks/${task.id}/cvat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label_set: labelSet }),
      });
      const data = await res.json();
      if (!res.ok) { setCvatResult({ warning: data.error ?? "Failed" }); return; }
      setCvatResult(data);
      setShowCvatForm(false);
    } catch {
      setCvatResult({ warning: "Network error" });
    } finally {
      setSendingCvat(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <Link href="/tasks" className="hover:text-slate-900 flex items-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5" />Tasks
            </Link>
            <span>/</span>
            <span className="truncate max-w-xs">{task.description.slice(0, 60)}{task.description.length > 60 ? "…" : ""}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={PRIORITY_VARIANT[task.priority] ?? "outline"}>{task.priority}</Badge>
            <Badge variant={STATUS_VARIANT[task.status] ?? "outline"}>{task.status}</Badge>
            {task.classification && <Badge variant="outline">{task.classification}</Badge>}
            {task.vikunja_task_id && process.env.NEXT_PUBLIC_VIKUNJA_URL && (
              <a
                href={`${process.env.NEXT_PUBLIC_VIKUNJA_URL}/tasks/${task.vikunja_task_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
              >
                Vikunja ↗
              </a>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {canEdit && !editing && <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button>}
          {canEdit && task.classification === "image annotation" && task.upload_count > 0 && (
            <Button size="sm" variant="outline" onClick={() => setShowCvatForm((v) => !v)}>
              {showCvatForm ? "Cancel" : "Send to CVAT"}
            </Button>
          )}
          {canDelete && <Button size="sm" variant="destructive" onClick={handleDeleteTask}>Delete</Button>}
        </div>
      </div>

      {showCvatForm && (
        <form onSubmit={handleSendToCvat} className="rounded-md border bg-white p-4 space-y-3">
          <p className="text-sm font-medium text-slate-800">
            Send {task.upload_count} linked file{task.upload_count !== 1 ? "s" : ""} to CVAT as an annotation task
          </p>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">
              Labels <span className="text-slate-400 font-normal">(comma-separated)</span>
            </label>
            <Input
              value={cvatLabels}
              onChange={(e) => setCvatLabels(e.target.value)}
              placeholder="corn plant, diseased, healthy"
              className="h-8"
            />
          </div>
          <Button type="submit" size="sm" disabled={sendingCvat}>
            {sendingCvat ? "Sending…" : "Create CVAT Task"}
          </Button>
        </form>
      )}

      {cvatResult && (
        <div className="rounded-md border bg-slate-50 px-4 py-3 text-sm space-y-1">
          {cvatResult.cvat_url ? (
            <>
              <p className="font-medium text-slate-800">CVAT task created — {cvatResult.image_count} images ready for annotation</p>
              <a href={cvatResult.cvat_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                Open annotation task in CVAT →
              </a>
            </>
          ) : cvatResult.message ? (
            <p className="text-slate-600">{cvatResult.message}</p>
          ) : null}
          {cvatResult.warning && <p className="text-amber-700">{cvatResult.warning}</p>}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {/* Left — Task details */}
        <div className="col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
            <CardContent>
              {editing ? (
                <form onSubmit={handleSave} className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1">
                    <label className="text-sm font-medium text-slate-700">Description</label>
                    <textarea className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                      value={desc} onChange={(e) => setDesc(e.target.value)} required />
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
                  {saveError && <p className="col-span-2 text-sm text-red-600">{saveError}</p>}
                  <div className="col-span-2 flex gap-2">
                    <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                  </div>
                </form>
              ) : (
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div className="col-span-2">
                    <dt className="text-slate-500">Description</dt>
                    <dd className="font-medium mt-0.5 whitespace-pre-wrap">{task.description}</dd>
                  </div>
                  <div><dt className="text-slate-500">Classification</dt><dd className="mt-0.5">{task.classification ?? "—"}</dd></div>
                  <div><dt className="text-slate-500">Experiment</dt><dd className="mt-0.5">{task.experiment_name ?? "—"}{task.farm_name ? ` / ${task.farm_name}` : ""}</dd></div>
                  <div><dt className="text-slate-500">Status</dt><dd className="mt-0.5">{task.status}</dd></div>
                  <div><dt className="text-slate-500">Priority</dt><dd className="mt-0.5">{task.priority}</dd></div>
                  <div><dt className="text-slate-500">Due date</dt>
                    <dd className="mt-0.5">{task.due_date ? new Date(task.due_date + "T00:00:00").toLocaleDateString() : "—"}</dd>
                  </div>
                  <div><dt className="text-slate-500">Linked files</dt><dd className="mt-0.5">{task.upload_count || "—"}</dd></div>
                </dl>
              )}
            </CardContent>
          </Card>

          {/* Linked uploads */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Linked Files ({task.upload_count})</CardTitle>
              {canEdit && (
                <Button size="sm" variant="outline" onClick={() => setShowPicker((v) => !v)}>
                  {showPicker ? "Close picker" : "Link Files"}
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {showPicker && (
                <div className="rounded-md border p-3 space-y-3 bg-slate-50">
                  <div className="flex flex-wrap gap-2 items-center">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                      <Input placeholder="Search files…" value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} className="pl-8 h-8 w-44" />
                    </div>
                    <select value={pickerProject} onChange={(e) => setPickerProject(e.target.value)}
                      className="h-8 rounded-md border border-input bg-white px-2 text-sm">
                      <option value="all">All Projects</option>
                      {projects.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                    </select>
                    <select value={pickerFarm} onChange={(e) => setPickerFarm(e.target.value)}
                      className="h-8 rounded-md border border-input bg-white px-2 text-sm">
                      <option value="all">All Farms</option>
                      {farms.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <Button size="sm" variant="outline" className="h-8" onClick={selectAllVisible}>
                      Select all visible ({filteredPicker.filter((i) => !i.linked).length})
                    </Button>
                    {selected.size > 0 && (
                      <Button size="sm" className="h-8" disabled={linking} onClick={handleLinkUploads}>
                        {linking ? "Linking…" : `Link ${selected.size} file${selected.size !== 1 ? "s" : ""}`}
                      </Button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto rounded-md border bg-white">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8" />
                          <TableHead>File</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Farm</TableHead>
                          <TableHead>Project</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPicker.length === 0 ? (
                          <TableRow><TableCell colSpan={5} className="text-center text-slate-500 py-4">No files found</TableCell></TableRow>
                        ) : filteredPicker.map((item) => {
                          const k = itemKey(item);
                          return (
                            <TableRow key={k} className={item.linked ? "opacity-40" : "cursor-pointer hover:bg-slate-50"}
                              onClick={() => !item.linked && toggleSelected(item)}>
                              <TableCell>
                                {item.linked
                                  ? <span className="text-xs text-emerald-600 font-medium">linked</span>
                                  : <input type="checkbox" className="h-4 w-4 accent-slate-700"
                                      checked={selected.has(k)} onChange={() => toggleSelected(item)}
                                      onClick={(e) => e.stopPropagation()} />}
                              </TableCell>
                              <TableCell className="text-sm font-mono truncate max-w-[160px]">{item.filename}</TableCell>
                              <TableCell className="text-sm text-slate-500">{item.category ?? "—"}</TableCell>
                              <TableCell className="text-sm text-slate-500">{item.farm_name ?? "—"}</TableCell>
                              <TableCell className="text-sm text-slate-500">{item.project_name ?? "—"}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {linkedItems.length === 0 ? (
                <p className="text-sm text-slate-500">No files linked yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Farm</TableHead>
                      <TableHead>Project</TableHead>
                      {canEdit && <TableHead className="w-10" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linkedItems.map((item) => (
                      <TableRow key={itemKey(item)}>
                        <TableCell className="text-sm font-mono">{item.filename}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{item.upload_table === "photos" ? "photo" : "lab"}</Badge></TableCell>
                        <TableCell className="text-sm text-slate-500">{item.farm_name ?? "—"}</TableCell>
                        <TableCell className="text-sm text-slate-500">{item.project_name ?? "—"}</TableCell>
                        {canEdit && (
                          <TableCell>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-red-500 hover:text-red-700"
                              onClick={() => handleUnlink(item)}>×</Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right — Assignees */}
        <div>
          <Card>
            <CardHeader><CardTitle className="text-base">Assignees</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {users.map((u) => {
                const isAssigned = task.assignees.some((a) => a.id === u.id);
                return (
                  <div key={u.id} className="flex items-center justify-between gap-2">
                    <span className={`text-sm ${isAssigned ? "font-medium text-slate-900" : "text-slate-500"}`}>{u.name}</span>
                    {canEdit && (
                      <Button size="sm" variant={isAssigned ? "secondary" : "outline"} className="h-6 px-2 text-xs"
                        onClick={() => handleToggleAssignee(u.id, isAssigned)}>
                        {isAssigned ? "Remove" : "Assign"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
