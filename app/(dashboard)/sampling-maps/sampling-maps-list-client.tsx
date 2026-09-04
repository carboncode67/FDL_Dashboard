"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SamplingMapRow {
  id: number;
  farmId: number;
  name: string;
  Farm_Name: string;
  Experiment_Name: string | null;
  polygonCount: number;
  pointCount: number;
  updated_at: string;
}

interface FarmOption {
  id: number;
  name: string;
}

interface ExperimentOption {
  id: number;
  farmId: number;
  name: string;
}

export function SamplingMapsListClient({
  data,
  farms,
  experiments,
}: {
  data: SamplingMapRow[];
  farms: FarmOption[];
  experiments: ExperimentOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [farmId, setFarmId] = useState("");
  const [experimentId, setExperimentId] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const experimentsForFarm = useMemo(
    () => experiments.filter((e) => String(e.farmId) === farmId),
    [experiments, farmId],
  );

  function closeDialog() {
    setOpen(false);
    setFarmId("");
    setExperimentId("");
    setName("");
    setError("");
  }

  async function handleCreate() {
    if (!farmId) {
      setError("Choose a farm");
      return;
    }
    if (!name.trim()) {
      setError("Enter a map name");
      return;
    }
    setError("");
    setCreating(true);
    try {
      const res = await fetch("/api/sampling-maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ farm_id: farmId, experiment_id: experimentId || null, name: name.trim() }),
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

  const columns = [
    { key: "name", header: "Name" },
    { key: "Farm_Name", header: "Farm" },
    {
      key: "Experiment_Name",
      header: "Experiment",
      render: (row: Record<string, unknown>) => {
        const rowName = (row as unknown as SamplingMapRow).Experiment_Name;
        return rowName ? rowName : <Badge variant="outline">Not linked</Badge>;
      },
    },
    { key: "polygonCount", header: "Polygons" },
    { key: "pointCount", header: "Points" },
    {
      key: "updated_at",
      header: "Updated",
      render: (row: Record<string, unknown>) =>
        new Date((row as unknown as SamplingMapRow).updated_at).toLocaleDateString(),
    },
  ];

  return (
    <>
      <DataTable
        title="Sampling Maps"
        data={data as unknown as Record<string, unknown>[]}
        columns={columns}
        searchKeys={["name", "Farm_Name", "Experiment_Name"]}
        onAdd={() => setOpen(true)}
        addLabel="New Map"
        onRowClick={(row) => {
          const r = row as unknown as SamplingMapRow;
          router.push(`/farms/${r.farmId}/maps/${r.id}`);
        }}
      />

      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Sampling Map</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Select
              value={farmId}
              onValueChange={(v) => { setFarmId(v ?? ""); setExperimentId(""); setError(""); }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a farm" />
              </SelectTrigger>
              <SelectContent>
                {farms.map((f) => (
                  <SelectItem key={f.id} value={String(f.id)} label={f.name}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={experimentId}
              onValueChange={(v) => setExperimentId(v ?? "")}
              disabled={!farmId || experimentsForFarm.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={farmId ? "Not linked to an experiment" : "Choose a farm first"} />
              </SelectTrigger>
              <SelectContent>
                {experimentsForFarm.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)} label={e.name}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              placeholder="Map name…"
            />

            <p className="text-xs text-slate-500">
              Link to an experiment to be able to connect sampling points to its tests.
            </p>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating || !farmId || !name.trim()}>
                {creating ? "Creating…" : "Create & Open"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
