"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface SamplingMapRow {
  id: number;
  name: string;
  description: string | null;
  experiment_id: number | null;
  updated_at: string;
  _count: { Polygons: number; Points: number };
}

interface ExperimentOption {
  id: number;
  experiment_name: string | null;
}

interface Props {
  farmId: number;
  maps: SamplingMapRow[];
  experiments: ExperimentOption[];
  canCreate: boolean;
  canDelete: boolean;
}

export function SamplingMapsTab({ farmId, maps, experiments, canCreate, canDelete }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [experimentId, setExperimentId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const experimentName = (id: number | null) =>
    id == null ? null : experiments.find((e) => e.id === id)?.experiment_name ?? `Experiment #${id}`;

  async function handleCreate() {
    if (!name.trim()) {
      setError("Enter a map name");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/sampling-maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          farm_id: farmId,
          experiment_id: experimentId || null,
          name: name.trim(),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Failed to create map");
        return;
      }
      const created = await res.json();
      router.push(`/farms/${farmId}/maps/${created.id}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this sampling map and all its polygons/points?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/sampling-maps/${id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Sampling Maps</CardTitle>
        {canCreate && (
          <Button size="sm" onClick={() => setOpen(true)}>
            + New Map
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {maps.length === 0 ? (
          <p className="text-sm text-slate-500">
            No sampling maps yet. Create one to draw polygons and place sampling points on this farm.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Experiment</TableHead>
                <TableHead>Polygons</TableHead>
                <TableHead>Points</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {maps.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <Link href={`/farms/${farmId}/maps/${m.id}`} className="text-blue-600 hover:underline font-medium">
                      {m.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-slate-500">{experimentName(m.experiment_id) ?? "—"}</TableCell>
                  <TableCell>{m._count.Polygons}</TableCell>
                  <TableCell>{m._count.Points}</TableCell>
                  <TableCell className="text-slate-500 text-sm">{new Date(m.updated_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    {canDelete && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700"
                        disabled={deletingId === m.id}
                        onClick={() => handleDelete(m.id)}
                      >
                        {deletingId === m.id ? "Deleting…" : "Delete"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); setName(""); setExperimentId(""); setError(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Sampling Map</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              placeholder="Map name…"
              autoFocus
            />
            <Select value={experimentId} onValueChange={(v) => setExperimentId(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Not linked to an experiment" />
              </SelectTrigger>
              <SelectContent>
                {experiments.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)} label={e.experiment_name ?? `Experiment #${e.id}`}>
                    {e.experiment_name ?? `Experiment #${e.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              Link to an experiment to be able to connect sampling points to its tests.
            </p>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={saving || !name.trim()}>
                {saving ? "Creating…" : "Create & Open"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
