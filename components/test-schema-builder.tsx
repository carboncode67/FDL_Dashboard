"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, ArrowUp, ArrowDown } from "lucide-react";

type Column = { col_index: number; field_type: "text" | "number"; label: string };

interface Props {
  testId: number;
  initialColumns: Column[];
}

export function TestSchemaBuilder({ testId, initialColumns }: Props) {
  const [columns, setColumns] = useState<Column[]>(initialColumns);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function addColumn() {
    setColumns((prev) => [
      ...prev,
      { col_index: prev.length, field_type: "text", label: "" },
    ]);
    setSaved(false);
  }

  function removeColumn(i: number) {
    const next = columns.filter((_, idx) => idx !== i).map((c, idx) => ({ ...c, col_index: idx }));
    setColumns(next);
    setSaved(false);
  }

  function moveColumn(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= columns.length) return;
    const next = [...columns];
    [next[i], next[j]] = [next[j], next[i]];
    setColumns(next.map((c, idx) => ({ ...c, col_index: idx })));
    setSaved(false);
  }

  function updateColumn(i: number, patch: Partial<Column>) {
    const next = [...columns];
    next[i] = { ...next[i], ...patch };
    setColumns(next);
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`/api/tests/${testId}/schema`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columns }),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Define the columns for this test&apos;s data template. Treatments linked to this test will fill in values using these columns.
      </p>

      {columns.length === 0 ? (
        <p className="text-sm text-slate-400 italic">No columns defined — add one below.</p>
      ) : (
        <div className="space-y-2">
          {columns.map((col, i) => (
            <div key={i} className="flex gap-2 items-center">
              <select
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                value={col.field_type}
                onChange={(e) => updateColumn(i, { field_type: e.target.value as "text" | "number" })}
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
              </select>
              <Input
                placeholder="Column label"
                value={col.label}
                onChange={(e) => updateColumn(i, { label: e.target.value })}
                className="flex-1"
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => moveColumn(i, -1)} disabled={i === 0}>
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => moveColumn(i, 1)} disabled={i === columns.length - 1}>
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => removeColumn(i)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addColumn}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Column
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : saved ? "Saved" : "Save Schema"}
        </Button>
      </div>
    </div>
  );
}
