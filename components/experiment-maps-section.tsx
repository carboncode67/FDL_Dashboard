"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";

export interface ExperimentMapRow {
  id: number;
  name: string;
  updated_at: string;
  polygonCount: number;
  pointCount: number;
}

// Mirrors components/experiment-tasks-section.tsx's layout/idiom (header row + inline
// "New" form, no separate dialog) so the experiment page's sections read as one family.
// Maps created here are pre-linked to this experiment (POST carries experiment_id), so
// their points can immediately be connected to the experiment's tests — maps created
// from the Farm → Maps tab instead start unlinked unless an experiment is picked there.
export function ExperimentMapsSection({
  farmId,
  experimentId,
  initialMaps,
}: {
  farmId: number;
  experimentId: number;
  initialMaps: ExperimentMapRow[];
}) {
  const router = useRouter();
  const [maps, setMaps] = useState(initialMaps);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function handleCreate() {
    if (!name.trim()) {
      setError("Enter a map name");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/sampling-maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ farm_id: farmId, experiment_id: experimentId, name: name.trim() }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Failed to create map");
        return;
      }
      const created = await res.json();
      router.push(`/farms/${farmId}/maps/${created.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this sampling map and all its polygons/points?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/sampling-maps/${id}`, { method: "DELETE" });
      if (res.ok) setMaps((prev) => prev.filter((m) => m.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4 mt-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-stone-900">Sampling Maps</h3>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            if (showForm) {
              setShowForm(false);
            } else {
              setName("");
              setError(null);
              setShowForm(true);
            }
          }}
        >
          {showForm ? <><X className="h-4 w-4 mr-1" />Cancel</> : <><Plus className="h-4 w-4 mr-1" />New Map</>}
        </Button>
      </div>

      {showForm && (
        <div className="flex items-start gap-2 rounded-md border border-stone-200 p-3">
          <div className="flex-1 space-y-1">
            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              placeholder="Map name…"
              autoFocus
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
          <Button type="button" size="sm" onClick={handleCreate} disabled={creating || !name.trim()}>
            {creating ? "Creating…" : "Create & Open"}
          </Button>
        </div>
      )}

      {maps.length === 0 ? (
        <p className="text-sm text-stone-500">No sampling maps for this experiment yet.</p>
      ) : (
        <div className="rounded-md border border-stone-200 divide-y">
          {maps.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-3 py-2">
              <div>
                <Link href={`/farms/${farmId}/maps/${m.id}`} className="text-blue-600 hover:underline font-medium text-sm">
                  {m.name}
                </Link>
                <p className="text-xs text-stone-500 mt-0.5">
                  {m.polygonCount} polygon{m.polygonCount === 1 ? "" : "s"}, {m.pointCount} point{m.pointCount === 1 ? "" : "s"}
                  {" · "}Updated {new Date(m.updated_at).toLocaleDateString()}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-red-600 hover:text-red-700"
                disabled={deletingId === m.id}
                onClick={() => handleDelete(m.id)}
              >
                {deletingId === m.id ? "Deleting…" : "Delete"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
