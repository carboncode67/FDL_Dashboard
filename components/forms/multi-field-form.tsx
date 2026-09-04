"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X } from "lucide-react";

export interface FarmOption {
  id: number;
  name: string;
}

interface FieldRow {
  key: number;
  name: string;
  boundary_source: string;
}

let rowKeySeq = 0;
function newRow(): FieldRow {
  return { key: rowKeySeq++, name: "", boundary_source: "" };
}

interface MultiFieldFormProps {
  farms: FarmOption[];
  defaultFarmId?: number;
  onSuccess?: () => void;
}

export function MultiFieldForm({ farms, defaultFarmId, onSuccess }: MultiFieldFormProps) {
  const [farmsId, setFarmsId] = useState(defaultFarmId?.toString() ?? "");
  const [rows, setRows] = useState<FieldRow[]>([newRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateRow(key: number, patch: Partial<FieldRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((rs) => [...rs, newRow()]);
  }

  function removeRow(key: number) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmed = rows.map((r) => ({ ...r, name: r.name.trim() }));
    if (trimmed.some((r) => !r.name)) {
      setError("Every field needs a name.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Farms_id: farmsId ? parseInt(farmsId) : null,
          fields: trimmed.map((r) => ({ Name: r.name, boundary_source: r.boundary_source || null })),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Failed to save");
        return;
      }
      onSuccess?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Farm</Label>
        <Select value={farmsId} onValueChange={(v) => setFarmsId(v ?? "")}>
          <SelectTrigger>
            <SelectValue placeholder="Select a farm..." />
          </SelectTrigger>
          <SelectContent>
            {farms.map((f) => (
              <SelectItem key={f.id} value={f.id.toString()}>{f.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Fields</Label>
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={row.key} className="flex items-center gap-2">
              <Input
                value={row.name}
                onChange={(e) => updateRow(row.key, { name: e.target.value })}
                placeholder={`Field ${i + 1} name`}
                className="flex-1"
                required
              />
              <Input
                value={row.boundary_source}
                onChange={(e) => updateRow(row.key, { boundary_source: e.target.value })}
                placeholder="Boundary source (optional)"
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => removeRow(row.key)}
                disabled={rows.length === 1}
                aria-label="Remove field"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add another field
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" disabled={saving} className="w-full">
        {saving ? "Saving..." : `Create ${rows.length} Field${rows.length === 1 ? "" : "s"}`}
      </Button>
    </form>
  );
}
