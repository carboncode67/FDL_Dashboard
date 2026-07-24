"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, ArrowUp, ArrowDown } from "lucide-react";

type FieldType = "text" | "number" | "boolean" | "date" | "select" | "photo";

type Column = {
  col_index: number;
  field_type: FieldType;
  label: string;
  required: boolean;
  options: string[] | null;
  optionsText?: string; // raw text of the options input — kept separate from
  // `options` so the displayed value is never re-derived (and silently
  // stripped of spaces/trailing commas) from the already-parsed array
};

interface Props {
  formId: number;
  initialColumns: Column[];
}

function withOptionsText(col: Column): Column {
  return { ...col, optionsText: col.optionsText ?? (col.options ?? []).join(", ") };
}

export function FormSchemaBuilder({ formId, initialColumns }: Props) {
  const [columns, setColumns] = useState<Column[]>(initialColumns.map(withOptionsText));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function addColumn() {
    setColumns((prev) => [
      ...prev,
      { col_index: prev.length, field_type: "text", label: "", required: false, options: null, optionsText: "" },
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
      const payload = columns.map(({ optionsText: _optionsText, ...c }) => c);
      await fetch(`/api/forms/${formId}/schema`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columns: payload }),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Define the fields recipients will fill in. Forms are repeatable — the same recipient can submit
        this form more than once.
      </p>

      {columns.length === 0 ? (
        <p className="text-sm text-slate-400 italic">No fields defined — add one below.</p>
      ) : (
        <div className="space-y-2">
          {columns.map((col, i) => (
            <div key={i} className="space-y-1.5 border-b pb-2 last:border-b-0">
              <div className="flex gap-2 items-center">
                <select
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  value={col.field_type}
                  onChange={(e) => {
                    const field_type = e.target.value as FieldType;
                    updateColumn(i, {
                      field_type,
                      options: field_type === "select" ? (col.options ?? []) : null,
                    });
                  }}
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="boolean">Yes / No</option>
                  <option value="date">Date</option>
                  <option value="select">Single choice</option>
                  <option value="photo">Photo</option>
                </select>
                <Input
                  placeholder="Field label"
                  value={col.label}
                  onChange={(e) => updateColumn(i, { label: e.target.value })}
                  className="flex-1"
                />
                <label className="flex items-center gap-1.5 text-xs text-slate-600 shrink-0 px-1">
                  <input
                    type="checkbox"
                    checked={col.required}
                    onChange={(e) => updateColumn(i, { required: e.target.checked })}
                    className="rounded"
                  />
                  Required
                </label>
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
              {col.field_type === "select" && (
                <Input
                  placeholder="Comma-separated options (e.g. Yes, No, Unsure)"
                  value={col.optionsText ?? ""}
                  onChange={(e) => {
                    const text = e.target.value;
                    updateColumn(i, {
                      optionsText: text,
                      options: text.split(",").map((s) => s.trim()).filter((s) => s.length > 0),
                    });
                  }}
                  className="ml-[calc(6rem+0.5rem)]"
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addColumn}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Field
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : saved ? "Saved" : "Save Fields"}
        </Button>
      </div>
    </div>
  );
}
