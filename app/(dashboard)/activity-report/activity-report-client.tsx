"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Send, Trash2, Edit2, BarChart2, CheckSquare, Square, Eye } from "lucide-react";

interface Contact {
  id: number;
  name: string;
  phone: string;
  farm_name: string | null;
}

interface ProjectWithContacts {
  id: number;
  Project_Name: string | null;
  contacts: { id: number; name: string; farm_name: string | null }[];
}

interface Subscription {
  id: number;
  project_id: number | null;
  Project: { id: number; Project_Name: string | null } | null;
  emails: string;
  frequency: string;
  active: boolean;
  last_sent_at: Date | string | null;
}

type SubscriptionFormData = {
  project_id: number;
  emails: string;
  frequency: string;
  active: boolean;
};

const FREQ_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Bi-weekly",
  monthly: "Monthly",
};

function SubscriptionForm({
  projects,
  initial,
  onSave,
  onCancel,
}: {
  projects: ProjectWithContacts[];
  initial?: Partial<Subscription>;
  onSave: (data: SubscriptionFormData) => void;
  onCancel: () => void;
}) {
  const [projectId, setProjectId] = useState<number | "">(initial?.project_id ?? "");
  const [emails,    setEmails]    = useState(initial?.emails ?? "");
  const [frequency, setFrequency] = useState(initial?.frequency ?? "weekly");
  const [active,    setActive]    = useState(initial?.active ?? true);

  const selectedProject = projects.find(p => p.id === Number(projectId)) ?? null;

  function handleSubmit() {
    if (!projectId || !emails.trim()) {
      alert("Please select a project and enter recipient emails.");
      return;
    }
    onSave({ project_id: Number(projectId), emails, frequency, active });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-600 mb-1">Project</label>
          <select
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={projectId}
            onChange={e => setProjectId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">— Select a project —</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.Project_Name ?? `Project #${p.id}`}
              </option>
            ))}
          </select>
          {selectedProject && (
            <p className="text-xs text-slate-500 mt-1">
              {selectedProject.contacts.length} farmer{selectedProject.contacts.length !== 1 ? "s" : ""} associated
              {selectedProject.contacts.length > 0 && (
                <span className="ml-1 text-slate-400">
                  ({selectedProject.contacts.map(c => c.name).join(", ")})
                </span>
              )}
            </p>
          )}
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-600 mb-1">Recipients (separate multiple with ;)</label>
          <input
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={emails}
            onChange={e => setEmails(e.target.value)}
            placeholder="coordinator@cornell.edu; advisor@example.com"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Frequency</label>
          <select
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={frequency}
            onChange={e => setFrequency(e.target.value)}
          >
            <option value="weekly">Weekly</option>
            <option value="biweekly">Bi-weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="accent-emerald-600" />
            Active (send automatically)
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSubmit}>
          Save subscription
        </Button>
      </div>
    </div>
  );
}

export function ActivityReportClient({
  contacts,
  projects,
  initialSubscriptions,
}: {
  contacts: Contact[];
  projects: ProjectWithContacts[];
  initialSubscriptions: Subscription[];
}) {
  const [subs,     setSubs]     = useState<Subscription[]>(initialSubscriptions);
  const [creating, setCreating] = useState(false);
  const [editing,  setEditing]  = useState<number | null>(null);
  const [sending,  setSending]  = useState<number | null>(null);
  const [notice,   setNotice]   = useState("");
  // Standalone preview viewer
  const [viewSelected, setViewSelected] = useState<Set<number>>(new Set());

  async function handleCreate(data: SubscriptionFormData) {
    const res = await fetch("/api/reporting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const created = await res.json();
    setSubs(prev => [created, ...prev]);
    setCreating(false);
  }

  async function handleUpdate(id: number, data: SubscriptionFormData) {
    await fetch(`/api/reporting/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const project = projects.find(p => p.id === data.project_id) ?? null;
    setSubs(prev => prev.map(s =>
      s.id === id
        ? { ...s, ...data, Project: project ? { id: project.id, Project_Name: project.Project_Name } : null }
        : s
    ));
    setEditing(null);
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this subscription?")) return;
    await fetch(`/api/reporting/${id}`, { method: "DELETE" });
    setSubs(prev => prev.filter(s => s.id !== id));
  }

  async function handleSend(id: number) {
    setSending(id);
    try {
      const res  = await fetch(`/api/reporting/${id}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setNotice(`Report sent to ${data.sent_to.join(", ")}`);
        setSubs(prev => prev.map(s => s.id === id ? { ...s, last_sent_at: new Date().toISOString() } : s));
      } else {
        setNotice(`Error: ${data.error}`);
      }
    } finally {
      setSending(null);
      setTimeout(() => setNotice(""), 5000);
    }
  }

  function previewSubscription(id: number) {
    window.open(`/api/reporting/preview?subscription_id=${id}`, "_blank");
  }

  function previewCustom() {
    if (viewSelected.size === 0) return;
    const ids = Array.from(viewSelected).join(",");
    window.open(`/api/reporting/preview?contact_ids=${ids}`, "_blank");
  }

  function toggleViewFarmer(id: number) {
    setViewSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Activity Reports</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Automatically email 14-day submission reports to coordinators.
          </p>
        </div>
        {!creating && (
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => setCreating(true)}
          >
            <Plus className="h-4 w-4 mr-2" /> New subscription
          </Button>
        )}
      </div>

      {notice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-2 rounded-lg">
          {notice}
        </div>
      )}

      {/* Standalone report viewer */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">Preview a report</p>
            <p className="text-xs text-slate-500 mt-0.5">Select farmers and open the report in a new tab.</p>
          </div>
          <Button
            size="sm"
            className="bg-slate-700 hover:bg-slate-800 text-white text-xs h-8"
            onClick={previewCustom}
            disabled={viewSelected.size === 0}
          >
            <Eye className="h-3 w-3 mr-1" />
            {`Preview (${viewSelected.size} farmer${viewSelected.size !== 1 ? "s" : ""})`}
          </Button>
        </div>
        <div className="border border-slate-200 rounded-lg divide-y max-h-48 overflow-y-auto">
          {contacts.map(c => (
            <div
              key={c.id}
              className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50"
              onClick={() => toggleViewFarmer(c.id)}
            >
              {viewSelected.has(c.id)
                ? <CheckSquare className="h-4 w-4 text-slate-600 shrink-0" />
                : <Square className="h-4 w-4 text-slate-300 shrink-0" />
              }
              <span className="text-sm text-slate-800">{c.name}</span>
              {c.farm_name && <span className="text-xs text-slate-400">{c.farm_name}</span>}
            </div>
          ))}
          {contacts.length === 0 && (
            <p className="text-xs text-slate-400 px-3 py-3">No WhatsApp farmers registered yet.</p>
          )}
        </div>
      </div>

      {creating && (
        <SubscriptionForm
          projects={projects}
          onSave={handleCreate}
          onCancel={() => setCreating(false)}
        />
      )}

      {subs.length === 0 && !creating && (
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
          <BarChart2 className="h-10 w-10" />
          <p className="text-sm">No subscriptions yet. Create one to start sending reports.</p>
        </div>
      )}

      {subs.map(sub => (
        <div key={sub.id} className="bg-white border border-slate-200 rounded-xl p-5">
          {editing === sub.id ? (
            <SubscriptionForm
              projects={projects}
              initial={sub}
              onSave={data => handleUpdate(sub.id, data)}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">
                      {sub.Project?.Project_Name ?? "(No project)"}
                    </span>
                    <Badge className={sub.active
                      ? "bg-emerald-100 text-emerald-800 text-xs"
                      : "bg-slate-100 text-slate-500 text-xs"}>
                      {sub.active ? "Active" : "Paused"}
                    </Badge>
                    <Badge className="bg-blue-50 text-blue-700 text-xs">
                      {FREQ_LABELS[sub.frequency]}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    To: {sub.emails}
                  </p>
                  {sub.last_sent_at && (
                    <p className="text-xs text-slate-400 mt-1">
                      Last sent: {new Date(sub.last_sent_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8 border-slate-300 text-slate-600 hover:bg-slate-50"
                    onClick={() => previewSubscription(sub.id)}
                    title="Preview report"
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    onClick={() => handleSend(sub.id)}
                    disabled={sending === sub.id}
                  >
                    <Send className="h-3 w-3 mr-1" />
                    {sending === sub.id ? "Sending..." : "Send now"}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditing(sub.id)}>
                    <Edit2 className="h-4 w-4 text-slate-400" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(sub.id)}>
                    <Trash2 className="h-4 w-4 text-slate-400" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
