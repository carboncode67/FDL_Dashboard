"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface DroneFormProps {
  onSuccess?: () => void;
  droneId?: number;
  initialData?: {
    Name?: string | null;
    Description?: string | null;
    Cost_Per_Acre?: number | null;
    Mobilization_Cost?: number | null;
  };
}

export function DroneForm({ onSuccess, droneId, initialData }: DroneFormProps) {
  const [name, setName] = useState(initialData?.Name ?? "");
  const [desc, setDesc] = useState(initialData?.Description ?? "");
  const [costAcre, setCostAcre] = useState(initialData?.Cost_Per_Acre?.toString() ?? "");
  const [mobCost, setMobCost] = useState(initialData?.Mobilization_Cost?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch(droneId ? `/api/drones/${droneId}` : "/api/drones", {
        method: droneId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Name: name, Description: desc, Cost_Per_Acre: costAcre ? parseFloat(costAcre) : null, Mobilization_Cost: mobCost ? parseFloat(mobCost) : null }),
      });
      onSuccess?.();
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
      <div className="space-y-1.5"><Label>Description</Label><Input value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Cost Per Acre ($)</Label><Input type="number" step="0.01" value={costAcre} onChange={(e) => setCostAcre(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Mobilization Cost ($)</Label><Input type="number" step="0.01" value={mobCost} onChange={(e) => setMobCost(e.target.value)} /></div>
      <Button type="submit" disabled={saving} className="w-full">{saving ? "Saving..." : droneId ? "Update" : "Create"}</Button>
    </form>
  );
}
