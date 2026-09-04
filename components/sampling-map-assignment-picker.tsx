"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type Assignment = {
  id: number;
  user_id: string;
  user_label: string;
};

interface Props {
  samplingMapId: number;
  initialAssignments: Assignment[];
  users: { id: string; name: string | null; email: string }[];
}

// Simplified GeofenceAssignmentPicker (components/geofence-assignment-picker.tsx) with no
// target-kind selector -- sampling maps are lab-member-only work (no farmer/Contact channel
// involved), so there's only one thing to pick.
export function SamplingMapAssignmentPicker({ samplingMapId, initialAssignments, users }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments);
  const [userId, setUserId] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const assignedIds = new Set(assignments.map((a) => a.user_id));
  const options = users.filter((u) => !assignedIds.has(u.id));

  async function handleAdd() {
    if (!userId) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/sampling-maps/${samplingMapId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      if (res.ok) {
        const created = await res.json();
        setAssignments((prev) => [...prev, created]);
        setUserId("");
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(assignmentId: number) {
    setRemovingId(assignmentId);
    try {
      const res = await fetch(`/api/sampling-maps/${samplingMapId}/assignments/${assignmentId}`, { method: "DELETE" });
      if (res.ok) setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
    } finally {
      setRemovingId(null);
    }
  }

  const selectClass = "h-9 rounded-md border border-input bg-transparent px-2 text-sm";

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Send this sampling map to a lab member&apos;s phone. It appears in their app&apos;s Sampling Maps list.
      </p>

      {assignments.length === 0 ? (
        <p className="text-sm text-slate-400 italic">Not sent to anyone yet.</p>
      ) : (
        <ul className="divide-y">
          {assignments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              <span>{a.user_label}</span>
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
        <select className={cn("flex-1", selectClass)} value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">— select a lab member —</option>
          {options.map((u) => (
            <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
          ))}
        </select>
        <Button type="button" size="sm" onClick={handleAdd} disabled={!userId || adding}>
          {adding ? "Adding..." : "Add"}
        </Button>
      </div>
    </div>
  );
}
