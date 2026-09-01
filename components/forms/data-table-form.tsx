"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Home = "none" | "test" | "drone";

interface TestOption { id: number; Test_Name: string | null; }
interface DroneOption { id: number; Name: string | null; }

interface DataTableFormProps {
  onSuccess?: () => void;
  dataTableId?: number;
  initialData?: {
    name?: string;
    description?: string | null;
    data_processing_instructions?: string | null;
    test_id?: number | null;
    drone_id?: number | null;
  };
  defaultTestId?: number;
  defaultDroneId?: number;
}

export function DataTableForm({
  onSuccess, dataTableId, initialData, defaultTestId, defaultDroneId,
}: DataTableFormProps) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [instructions, setInstructions] = useState(initialData?.data_processing_instructions ?? "");
  const [home, setHome] = useState<Home>(
    initialData?.test_id || defaultTestId ? "test" : initialData?.drone_id || defaultDroneId ? "drone" : "none"
  );
  const [testId, setTestId] = useState<number | null>(initialData?.test_id ?? defaultTestId ?? null);
  const [droneId, setDroneId] = useState<number | null>(initialData?.drone_id ?? defaultDroneId ?? null);
  const [tests, setTests] = useState<TestOption[]>([]);
  const [drones, setDrones] = useState<DroneOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/tests").then((r) => r.json()).then(setTests);
    fetch("/api/drones").then((r) => r.json()).then(setDrones);
  }, []);

  const textareaClass = "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring resize-y min-h-[100px]";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch(dataTableId ? `/api/data-tables/${dataTableId}` : "/api/data-tables", {
        method: dataTableId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          data_processing_instructions: instructions || null,
          test_id: home === "test" ? testId : null,
          drone_id: home === "drone" ? droneId : null,
        }),
      });
      onSuccess?.();
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Soil Sample Results" />
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
      </div>

      <div className="space-y-1.5">
        <Label>Home</Label>
        <p className="text-xs text-slate-500">
          A table can be dedicated to one Test or one piece of Equipment, or float free as a shared
          library entry other tests can attach.
        </p>
        <div className="flex gap-3 text-sm">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" name="home" checked={home === "none"} onChange={() => setHome("none")} /> None (shared)
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" name="home" checked={home === "test"} onChange={() => setHome("test")} /> Test
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" name="home" checked={home === "drone"} onChange={() => setHome("drone")} /> Equipment
          </label>
        </div>
        {home === "test" && (
          <select
            value={testId ?? ""}
            onChange={(e) => setTestId(e.target.value ? parseInt(e.target.value) : null)}
            className="h-8 w-full rounded-md border border-input bg-white px-2 text-sm"
            required
          >
            <option value="" disabled>— choose a test —</option>
            {tests.map((t) => <option key={t.id} value={t.id}>{t.Test_Name ?? `Test #${t.id}`}</option>)}
          </select>
        )}
        {home === "drone" && (
          <select
            value={droneId ?? ""}
            onChange={(e) => setDroneId(e.target.value ? parseInt(e.target.value) : null)}
            className="h-8 w-full rounded-md border border-input bg-white px-2 text-sm"
            required
          >
            <option value="" disabled>— choose equipment —</option>
            {drones.map((d) => <option key={d.id} value={d.id}>{d.Name ?? `Equipment #${d.id}`}</option>)}
          </select>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Data Processing Instructions</Label>
        <textarea
          className={textareaClass}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Describe the data structure and how to interpret raw data (markdown supported)"
        />
      </div>

      <Button type="submit" disabled={saving} className="w-full">
        {saving ? "Saving..." : dataTableId ? "Update" : "Create"}
      </Button>
    </form>
  );
}
