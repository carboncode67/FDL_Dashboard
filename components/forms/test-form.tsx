"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface TestFormProps {
  onSuccess?: () => void;
  testId?: number;
  initialData?: {
    Test_Name?: string | null;
    Test_Description?: string | null;
    Cost?: number | null;
    Planned_Date?: string | null;
    N_Samples?: number | null;
  };
}

export function TestForm({ onSuccess, testId, initialData }: TestFormProps) {
  const [name, setName] = useState(initialData?.Test_Name ?? "");
  const [desc, setDesc] = useState(initialData?.Test_Description ?? "");
  const [cost, setCost] = useState(initialData?.Cost?.toString() ?? "");
  const [planned, setPlanned] = useState(initialData?.Planned_Date?.slice(0, 10) ?? "");
  const [samples, setSamples] = useState(initialData?.N_Samples?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch(testId ? `/api/tests/${testId}` : "/api/tests", {
        method: testId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Test_Name: name, Test_Description: desc, Cost: cost ? parseFloat(cost) : null, Planned_Date: planned || null, N_Samples: samples ? parseInt(samples) : null }),
      });
      onSuccess?.();
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5"><Label>Test Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
      <div className="space-y-1.5"><Label>Description</Label><Input value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Cost ($)</Label><Input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Planned Date</Label><Input type="date" value={planned} onChange={(e) => setPlanned(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>N Samples</Label><Input type="number" value={samples} onChange={(e) => setSamples(e.target.value)} /></div>
      <Button type="submit" disabled={saving} className="w-full">{saving ? "Saving..." : testId ? "Update" : "Create"}</Button>
    </form>
  );
}
