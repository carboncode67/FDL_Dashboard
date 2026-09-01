"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, ArrowUp, ArrowDown, Upload } from "lucide-react";

type Column = { col_index: number; field_type: "text" | "number"; label: string };

const normalize = (s: string) => s.toLowerCase().replace(/[\s_]+/g, " ").trim();

// Minimal RFC-4180-ish single-line parser: handles quoted fields and escaped
// quotes ("") but not fields containing raw newlines. Good enough for reading
// a header row and sniffing column types.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(field); field = "";
    } else {
      field += c;
    }
  }
  out.push(field);
  return out.map((f) => f.trim());
}

const NUMERIC = /^-?(\d{1,3}(,\d{3})*|\d+)(\.\d+)?$/;

// Parse one CSV file's text into { label, field_type } column descriptors.
function columnsFromCsv(text: string): { label: string; field_type: "text" | "number" }[] {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  const sample = lines.slice(1, 51).map(parseCsvLine);
  return headers.map((label, col) => {
    const values = sample.map((r) => r[col]).filter((v) => v != null && v !== "");
    const isNumber = values.length > 0 && values.every((v) => NUMERIC.test(v));
    return { label: label || `Column ${col + 1}`, field_type: isNumber ? "number" : "text" };
  });
}

interface Props {
  endpoint: string;
  initialColumns: Column[];
}

export function SchemaBuilder({ endpoint, initialColumns }: Props) {
  const [columns, setColumns] = useState<Column[]>(initialColumns);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function importFromCsv(files: FileList | null) {
    if (!files || files.length === 0) return;
    const merged = new Map<string, { label: string; field_type: "text" | "number" }>();
    let fileCount = 0;
    for (const file of Array.from(files)) {
      try {
        const parsed = columnsFromCsv(await file.text());
        for (const c of parsed) {
          const key = normalize(c.label);
          // First file to introduce a column wins its type; later files only
          // add columns they're the first to mention.
          if (!merged.has(key)) merged.set(key, c);
        }
        fileCount++;
      } catch {
        /* skip unreadable file */
      }
    }
    if (merged.size === 0) {
      setImportNote("No columns found in the selected file(s).");
      return;
    }

    const imported = Array.from(merged.values());
    const existingKeys = new Set(columns.map((c) => normalize(c.label)));
    const isNew = imported.filter((c) => !existingKeys.has(normalize(c.label)));

    let base = columns;
    if (columns.length > 0) {
      const replace = confirm(
        `Found ${imported.length} column(s) across ${fileCount} file(s).\n\n` +
        `OK = replace the current ${columns.length} column(s).\n` +
        `Cancel = keep them and append ${isNew.length} new one(s).`
      );
      base = replace ? [] : columns;
    }

    const toAdd = base.length === 0 ? imported : isNew;
    const next = [...base, ...toAdd].map((c, idx) => ({
      col_index: idx,
      field_type: c.field_type,
      label: c.label,
    }));
    setColumns(next);
    setSaved(false);
    setImportNote(
      `Imported ${toAdd.length} column(s) from ${fileCount} file(s). Review types, then Save Schema.`
    );
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

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
      await fetch(endpoint, {
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
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-slate-500">
          Define the columns for this data template. Rows ingested for it must match these columns.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          multiple
          className="hidden"
          onChange={(e) => importFromCsv(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5 mr-1" /> Import from CSV
        </Button>
      </div>
      {importNote && <p className="text-xs text-emerald-700">{importNote}</p>}

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
