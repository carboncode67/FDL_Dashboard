"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface FarmFormProps {
  onSuccess?: () => void;
  initialData?: {
    Farm_Name?: string | null;
    farm_summary?: string | null;
    is_active?: boolean;
  };
  farmId?: number;
}

export function FarmForm({ onSuccess, initialData, farmId }: FarmFormProps) {
  const [farmName, setFarmName] = useState(initialData?.Farm_Name ?? "");
  const [summary, setSummary] = useState(initialData?.farm_summary ?? "");
  const [isActive, setIsActive] = useState(initialData?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const url = farmId ? `/api/farms/${farmId}` : "/api/farms";
      const method = farmId ? "PUT" : "POST";
      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Farm_Name: farmName,
          farm_summary: summary || null,
          is_active: isActive,
        }),
      });
      onSuccess?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5"><Label>Farm Name</Label><Input value={farmName} onChange={(e) => setFarmName(e.target.value)} required /></div>
      <div className="space-y-1.5">
        <Label>Farmer Summary (Markdown)</Label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={8}
          placeholder="Paste or type markdown content here…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={isActive}
          onClick={() => setIsActive((v) => !v)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            isActive ? "bg-green-500" : "bg-slate-200"
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
              isActive ? "translate-x-4.5" : "translate-x-0.5"
            }`}
          />
        </button>
        <Label>{isActive ? "Active" : "Inactive"}</Label>
      </div>
      <Button type="submit" disabled={saving} className="w-full">{saving ? "Saving..." : farmId ? "Update" : "Create"}</Button>
    </form>
  );
}
