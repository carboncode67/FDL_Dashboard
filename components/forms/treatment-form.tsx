"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { DuplicateWarningDialog, checkDuplicates, type DuplicateMatch } from "@/components/duplicate-warning-dialog";

type FieldDef = { label: string; field_type: "text" | "number" };

interface TreatmentFormProps {
  onSuccess?: () => void;
  initialData?: {
    Treatment_Name?: string | null;
    Description?: string | null;
    Notes?: string | null;
    allow_extra_rows?: boolean;
    TreatmentFieldDefinitions?: { label: string; field_type: string }[];
  };
  treatmentId?: number;
}

const SELECT = "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm";
const TEXTAREA = "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function TreatmentForm({ onSuccess, initialData, treatmentId }: TreatmentFormProps) {
  const [name,           setName]           = useState(initialData?.Treatment_Name ?? "");
  const [desc,           setDesc]           = useState(initialData?.Description ?? "");
  const [notes,          setNotes]          = useState(initialData?.Notes ?? "");
  const [allowExtraRows, setAllowExtraRows] = useState(initialData?.allow_extra_rows ?? false);
  const [fieldDefs,      setFieldDefs]      = useState<FieldDef[]>(
    initialData?.TreatmentFieldDefinitions?.map((d) => ({
      label:      d.label,
      field_type: (d.field_type as "text" | "number") || "text",
    })) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [dupCandidates, setDupCandidates] = useState<DuplicateMatch[]>([]);
  const confirmedRef = useRef(false);

  function addField() {
    setFieldDefs((prev) => [...prev, { label: "", field_type: "text" }]);
  }

  function removeField(i: number) {
    setFieldDefs((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateField(i: number, patch: Partial<FieldDef>) {
    setFieldDefs((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  async function doSave() {
    setSaving(true);
    try {
      await fetch(treatmentId ? `/api/treatments/${treatmentId}` : "/api/treatments", {
        method:  treatmentId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Treatment_Name:   name,
          Description:      desc,
          Notes:            notes,
          allow_extra_rows: allowExtraRows,
          fieldDefs:        fieldDefs.filter((d) => d.label.trim()),
        }),
      });
      onSuccess?.();
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!treatmentId && !confirmedRef.current) {
      const dupes = await checkDuplicates("treatments", name);
      if (dupes.length > 0) { setDupCandidates(dupes); return; }
    }
    await doSave();
  }

  return (
    <>
    <DuplicateWarningDialog
      open={dupCandidates.length > 0}
      entityLabel="Treatment Type"
      duplicates={dupCandidates}
      onConfirm={() => { confirmedRef.current = true; setDupCandidates([]); doSave(); }}
      onCancel={() => setDupCandidates([])}
    />
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label>Treatment Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className="space-y-1.5">
        <Label>Description</Label>
        <textarea rows={3} className={TEXTAREA} value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label>Notes</Label>
        <textarea rows={2} className={TEXTAREA} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {/* Field definition builder */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Custom Fields</Label>
          <Button type="button" variant="outline" size="sm" onClick={addField}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Field
          </Button>
        </div>
        {fieldDefs.length === 0 ? (
          <p className="text-xs text-slate-400 italic">
            No custom fields — this treatment uses only the rate / unit fields above.
          </p>
        ) : (
          <div className="space-y-1.5">
            <div className="grid grid-cols-[1fr_120px_32px] gap-2 text-xs font-medium text-slate-500 px-0.5">
              <span>Column Label</span>
              <span>Type</span>
              <span />
            </div>
            {fieldDefs.map((def, i) => (
              <div key={i} className="grid grid-cols-[1fr_120px_32px] gap-2 items-center">
                <Input
                  placeholder="e.g. Species"
                  value={def.label}
                  onChange={(e) => updateField(i, { label: e.target.value })}
                />
                <select
                  className={SELECT}
                  value={def.field_type}
                  onChange={(e) => updateField(i, { field_type: e.target.value as "text" | "number" })}
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                </select>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeField(i)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {fieldDefs.length > 0 && (
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={allowExtraRows}
            onChange={(e) => setAllowExtraRows(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          <span>Allow adding multiple rows</span>
          <span className="text-xs text-slate-400">(e.g. cover crop with several species)</span>
        </label>
      )}

      <Button type="submit" disabled={saving} className="w-full">
        {saving ? "Saving…" : treatmentId ? "Update" : "Create"}
      </Button>
    </form>
    </>
  );
}
