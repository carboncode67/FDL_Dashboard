"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface CropFormProps {
  onSuccess?: () => void;
  cropId?: number;
  initialData?: { Crop_Name?: string | null; Crop_Type?: string | null };
}

export function CropForm({ onSuccess, cropId, initialData }: CropFormProps) {
  const [name, setName] = useState(initialData?.Crop_Name ?? "");
  const [type, setType] = useState(initialData?.Crop_Type ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch(cropId ? `/api/crops/${cropId}` : "/api/crops", {
        method: cropId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Crop_Name: name, Crop_Type: type }),
      });
      onSuccess?.();
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5"><Label>Crop Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
      <div className="space-y-1.5"><Label>Crop Type</Label><Input value={type} onChange={(e) => setType(e.target.value)} /></div>
      <Button type="submit" disabled={saving} className="w-full">{saving ? "Saving..." : cropId ? "Update" : "Create"}</Button>
    </form>
  );
}
