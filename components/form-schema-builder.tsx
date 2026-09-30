"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, ArrowUp, ArrowDown } from "lucide-react";

type FieldType = "text" | "number" | "boolean" | "date" | "select" | "photo";

// Same normalization as lib/forms.ts's normalizeLabel — duplicated here
// rather than imported since that module pulls in the server-only prisma
// client and this is a "use client" component.
function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/[\s_]+/g, " ").trim();
}

type Column = {
  col_index: number;
  field_type: FieldType;
  label: string;
  required: boolean;
  options: string[] | null;
  show_when_label: string | null;
  show_when_value: string | null;
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
  const [error, setError] = useState<string | null>(null);

  const labelCounts = new Map<string, number>();
  for (const c of columns) {
    const norm = normalizeLabel(c.label);
    if (!norm) continue;
    labelCounts.set(norm, (labelCounts.get(norm) ?? 0) + 1);
  }
  const hasDuplicateLabels = Array.from(labelCounts.values()).some((n) => n > 1);
  const hasIncompleteConditions = columns.some((c) => c.show_when_label !== null && !c.show_when_value);

  function addColumn() {
    setColumns((prev) => [
      ...prev,
      {
        col_index: prev.length,
        field_type: "text",
        label: "",
        required: false,
        options: null,
        show_when_label: null,
        show_when_value: null,
        optionsText: "",
      },
    ]);
    setSaved(false);
  }

  // A removed or renamed field can leave other fields' show_when_label
  // pointing at a label that no longer exists in the list — clear those
  // rather than let them silently reference a ghost field.
  function clearDanglingConditions(cols: Column[]): Column[] {
    const labels = new Set(cols.map((c) => normalizeLabel(c.label)));
    return cols.map((c) =>
      c.show_when_label && !labels.has(normalizeLabel(c.show_when_label))
        ? { ...c, show_when_label: null, show_when_value: null }
        : c
    );
  }

  function removeColumn(i: number) {
    const next = clearDanglingConditions(
      columns.filter((_, idx) => idx !== i).map((c, idx) => ({ ...c, col_index: idx }))
    );
    setColumns(next);
    setSaved(false);
  }

  function moveColumn(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= columns.length) return;
    const next = [...columns];
    [next[i], next[j]] = [next[j], next[i]];
    // A field can only depend on an earlier one — reordering can invalidate
    // an existing condition either direction, so re-clear against the new order.
    const reindexed = next.map((c, idx) => ({ ...c, col_index: idx }));
    setColumns(
      reindexed.map((c) => {
        if (!c.show_when_label) return c;
        const parent = reindexed.find((p) => normalizeLabel(p.label) === normalizeLabel(c.show_when_label!));
        return parent && parent.col_index < c.col_index ? c : { ...c, show_when_label: null, show_when_value: null };
      })
    );
    setSaved(false);
  }

  function updateColumn(i: number, patch: Partial<Column>) {
    const next = [...columns];
    next[i] = { ...next[i], ...patch };
    setColumns("label" in patch ? clearDanglingConditions(next) : next);
    setSaved(false);
    setError(null);
  }

  // Fields eligible as field `i`'s condition parent: earlier in order,
  // labeled, and not themselves conditional (no chained conditions).
  function eligibleParents(i: number): Column[] {
    return columns.filter((c, idx) => idx < i && c.label.trim().length > 0 && !c.show_when_label);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload = columns.map(({ optionsText: _optionsText, ...c }) => c);
      const res = await fetch(`/api/forms/${formId}/schema`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columns: payload }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Save failed (${res.status})`);
        return;
      }
      setSaved(true);
    } catch {
      setError("Save failed — check your connection and try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-stone-500">
        Define the fields recipients will fill in. Forms are repeatable — the same recipient can submit
        this form more than once.
      </p>

      {columns.length === 0 ? (
        <p className="text-sm text-stone-400 italic">No fields defined — add one below.</p>
      ) : (
        <div className="space-y-2">
          {columns.map((col, i) => {
            const norm = normalizeLabel(col.label);
            const isDuplicate = norm.length > 0 && (labelCounts.get(norm) ?? 0) > 1;
            return (
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
                  className={`flex-1 ${isDuplicate ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                />
                <label className="flex items-center gap-1.5 text-xs text-stone-600 shrink-0 px-1">
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
              {isDuplicate && (
                <p className="text-xs text-red-600 ml-[calc(6rem+0.5rem)]">
                  Duplicate label — recipients&apos; answers for these fields will collide. Rename one.
                </p>
              )}
              {(() => {
                const parents = eligibleParents(i);
                if (parents.length === 0) return null;
                const parent = col.show_when_label
                  ? parents.find((p) => normalizeLabel(p.label) === normalizeLabel(col.show_when_label!)) ?? null
                  : null;
                return (
                  <div className="ml-[calc(6rem+0.5rem)] flex flex-wrap items-center gap-1.5 text-xs text-stone-600">
                    <label className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="checkbox"
                        checked={col.show_when_label !== null}
                        onChange={(e) =>
                          updateColumn(i, {
                            show_when_label: e.target.checked ? parents[0].label : null,
                            show_when_value: null,
                          })
                        }
                        className="rounded"
                      />
                      Only show when
                    </label>
                    {col.show_when_label !== null && (
                      <>
                        <select
                          className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs"
                          value={parent?.label ?? parents[0].label}
                          onChange={(e) => updateColumn(i, { show_when_label: e.target.value, show_when_value: null })}
                        >
                          {parents.map((p) => (
                            <option key={p.label} value={p.label}>{p.label}</option>
                          ))}
                        </select>
                        <span>is</span>
                        {parent?.field_type === "boolean" ? (
                          <select
                            className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs"
                            value={col.show_when_value ?? ""}
                            onChange={(e) => updateColumn(i, { show_when_value: e.target.value || null })}
                          >
                            <option value="" disabled>Choose...</option>
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </select>
                        ) : parent?.field_type === "select" ? (
                          <select
                            className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs"
                            value={col.show_when_value ?? ""}
                            onChange={(e) => updateColumn(i, { show_when_value: e.target.value || null })}
                          >
                            <option value="" disabled>Choose...</option>
                            {(parent.options ?? []).map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            placeholder="value"
                            value={col.show_when_value ?? ""}
                            onChange={(e) => updateColumn(i, { show_when_value: e.target.value || null })}
                            className="h-7 w-32 text-xs"
                          />
                        )}
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
            );
          })}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addColumn}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Field
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={saving || hasDuplicateLabels || hasIncompleteConditions}>
          {saving ? "Saving..." : saved ? "Saved" : "Save Fields"}
        </Button>
      </div>
    </div>
  );
}
