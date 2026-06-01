"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface FieldFormProps { onSuccess?: () => void; initialData?: { Name?: string | null; boundary_source?: string | null; Farms_id?: number | null }; fieldId?: number }

export function FieldForm({ onSuccess, initialData, fieldId }: FieldFormProps) {
  const [name, setName] = useState(initialData?.Name ?? "");
  const [boundary, setBoundary] = useState(initialData?.boundary_source ?? "");
  const [farmsId, setFarmsId] = useState(initialData?.Farms_id?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const url = fieldId ? `/api/fields/${fieldId}` : "/api/fields";
      await fetch(url, {
        method: fieldId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Name: name, boundary_source: boundary, Farms_id: farmsId ? parseInt(farmsId) : null }),
      });
      onSuccess?.();
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5"><Label>Field Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
      <div className="space-y-1.5"><Label>Boundary Source</Label><Input value={boundary} onChange={(e) => setBoundary(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Farm ID</Label><Input type="number" value={farmsId} onChange={(e) => setFarmsId(e.target.value)} /></div>
      <Button type="submit" disabled={saving} className="w-full">{saving ? "Saving..." : fieldId ? "Update" : "Create"}</Button>
    </form>
  );
}
