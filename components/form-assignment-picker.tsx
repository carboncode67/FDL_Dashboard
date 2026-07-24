"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type TargetKind = "contact" | "user" | "farm" | "experiment";

type Assignment = {
  id: number;
  contact_id: number | null;
  user_id: string | null;
  farm_id: number | null;
  farm_experiment_id: number | null;
  target_label: string;
};

interface Props {
  formId: number;
  initialAssignments: Assignment[];
  contacts: { id: number; name: string }[];
  users: { id: string; name: string | null; email: string }[];
  farms: { id: number; Farm_Name: string | null }[];
  experiments: { id: number; experiment_name: string | null }[];
}

const KIND_LABELS: Record<TargetKind, string> = {
  contact: "Farmer",
  user: "Lab Member",
  farm: "Whole Farm",
  experiment: "Whole Experiment",
};

export function FormAssignmentPicker({ formId, initialAssignments, contacts, users, farms, experiments }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments);
  const [kind, setKind] = useState<TargetKind>("contact");
  const [targetId, setTargetId] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const optionsByKind: Record<TargetKind, { value: string; label: string }[]> = {
    contact: contacts.map((c) => ({ value: String(c.id), label: c.name })),
    user: users.map((u) => ({ value: u.id, label: u.name ?? u.email })),
    farm: farms.map((f) => ({ value: String(f.id), label: f.Farm_Name ?? `Farm #${f.id}` })),
    experiment: experiments.map((e) => ({ value: String(e.id), label: e.experiment_name ?? `Experiment #${e.id}` })),
  };

  async function handleAdd() {
    if (!targetId) return;
    setAdding(true);
    try {
      const body: Record<string, string | number> = {};
      if (kind === "contact") body.contact_id = parseInt(targetId);
      if (kind === "user") body.user_id = targetId;
      if (kind === "farm") body.farm_id = parseInt(targetId);
      if (kind === "experiment") body.farm_experiment_id = parseInt(targetId);

      const res = await fetch(`/api/forms/${formId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const created = await res.json();
        setAssignments((prev) => [...prev, created]);
        setTargetId("");
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(assignmentId: number) {
    setRemovingId(assignmentId);
    try {
      const res = await fetch(`/api/forms/${formId}/assignments/${assignmentId}`, { method: "DELETE" });
      if (res.ok) setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
    } finally {
      setRemovingId(null);
    }
  }

  const selectClass = "h-9 rounded-md border border-input bg-transparent px-2 text-sm";

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Assign this form to an individual farmer or lab member, or broadly to everyone tied to a farm or
        experiment.
      </p>

      {assignments.length === 0 ? (
        <p className="text-sm text-slate-400 italic">Not assigned to anyone yet.</p>
      ) : (
        <ul className="divide-y">
          {assignments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              <span>
                {a.target_label}
                <span className="text-xs text-slate-400 ml-2">
                  ({KIND_LABELS[a.contact_id !== null ? "contact" : a.user_id !== null ? "user" : a.farm_id !== null ? "farm" : "experiment"]})
                </span>
              </span>
              <button
                type="button"
                onClick={() => handleRemove(a.id)}
                disabled={removingId === a.id}
                className="text-slate-400 hover:text-red-500 disabled:opacity-50"
                aria-label="Remove assignment"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2 items-center pt-1">
        <select
          className={selectClass}
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as TargetKind);
            setTargetId("");
          }}
        >
          {(Object.keys(KIND_LABELS) as TargetKind[]).map((k) => (
            <option key={k} value={k}>{KIND_LABELS[k]}</option>
          ))}
        </select>
        <select className={cn("flex-1", selectClass)} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          <option value="">— select —</option>
          {optionsByKind[kind].map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <Button type="button" size="sm" onClick={handleAdd} disabled={!targetId || adding}>
          {adding ? "Adding..." : "Add"}
        </Button>
      </div>
    </div>
  );
}
