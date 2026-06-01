"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface TreatmentFormProps { onSuccess?: () => void; initialData?: { Treatment_Name?: string | null; Description?: string | null; Notes?: string | null }; treatmentId?: number }

export function TreatmentForm({ onSuccess, initialData, treatmentId }: TreatmentFormProps) {
  const [name, setName] = useState(initialData?.Treatment_Name ?? "");
  const [desc, setDesc] = useState(initialData?.Description ?? "");
  const [notes, setNotes] = useState(initialData?.Notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch(treatmentId ? `/api/treatments/${treatmentId}` : "/api/treatments", {
        method: treatmentId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Treatment_Name: name, Description: desc, Notes: notes }),
      });
      onSuccess?.();
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5"><Label>Treatment Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
      <div className="space-y-1.5"><Label>Description</Label><Input value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <Button type="submit" disabled={saving} className="w-full">{saving ? "Saving..." : treatmentId ? "Update" : "Create"}</Button>
    </form>
  );
}
