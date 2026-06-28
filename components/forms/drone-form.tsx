"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DuplicateWarningDialog, checkDuplicates, type DuplicateMatch } from "@/components/duplicate-warning-dialog";

const CLASSIFICATIONS = [
  "image annotation", "ocr", "transcription", "categorization",
  "photogrammetric processing", "image classification", "spatial analysis",
  "data cleaning", "sampling", "drone flight", "tiling",
];
const PRIORITIES = ["low", "medium", "high"];

type TemplateRow = { description: string; classification: string; priority: string };
type LibraryTemplate = { id: number; description: string; classification: string | null; priority: string };

interface DroneFormProps {
  onSuccess?: () => void;
  droneId?: number;
  initialData?: {
    Name?: string | null;
    Description?: string | null;
    Cost_Per_Acre?: number | null;
    Mobilization_Cost?: number | null;
    TaskTemplates?: { description: string; classification: string | null; priority: string }[];
  };
}

export function DroneForm({ onSuccess, droneId, initialData }: DroneFormProps) {
  const [name, setName] = useState(initialData?.Name ?? "");
  const [desc, setDesc] = useState(initialData?.Description ?? "");
  const [costAcre, setCostAcre] = useState(initialData?.Cost_Per_Acre?.toString() ?? "");
  const [mobCost, setMobCost] = useState(initialData?.Mobilization_Cost?.toString() ?? "");
  const [templates, setTemplates] = useState<TemplateRow[]>(
    (initialData?.TaskTemplates ?? []).map((t) => ({
      description:    t.description,
      classification: t.classification ?? "",
      priority:       t.priority,
    }))
  );
  const [saving, setSaving] = useState(false);
  const [dupCandidates, setDupCandidates] = useState<DuplicateMatch[]>([]);
  const confirmedRef = useRef(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [library, setLibrary] = useState<LibraryTemplate[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  function addTemplate() {
    setTemplates((prev) => [...prev, { description: "", classification: "", priority: "medium" }]);
  }

  function removeTemplate(i: number) {
    setTemplates((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateTemplate(i: number, field: keyof TemplateRow, value: string) {
    setTemplates((prev) => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t));
  }

  async function openLibrary() {
    setLibraryOpen(true);
    setSelected(new Set());
    if (library.length === 0) {
      setLibraryLoading(true);
      const res = await fetch("/api/task-templates");
      setLibrary(await res.json());
      setLibraryLoading(false);
    }
  }

  function toggleLibraryItem(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function addFromLibrary() {
    const toAdd = library.filter((t) => selected.has(t.id)).map((t) => ({
      description:    t.description,
      classification: t.classification ?? "",
      priority:       t.priority,
    }));
    setTemplates((prev) => [...prev, ...toAdd]);
    setLibraryOpen(false);
    setSelected(new Set());
  }

  async function doSave() {
    setSaving(true);
    try {
      await fetch(droneId ? `/api/drones/${droneId}` : "/api/drones", {
        method: droneId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Name: name,
          Description: desc,
          Cost_Per_Acre: costAcre ? parseFloat(costAcre) : null,
          Mobilization_Cost: mobCost ? parseFloat(mobCost) : null,
          taskTemplates: templates.filter((t) => t.description.trim()).map((t) => ({
            description:    t.description.trim(),
            classification: t.classification || null,
            priority:       t.priority,
          })),
        }),
      });
      onSuccess?.();
    } finally { setSaving(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!droneId && !confirmedRef.current) {
      const dupes = await checkDuplicates("drones", name);
      if (dupes.length > 0) { setDupCandidates(dupes); return; }
    }
    await doSave();
  }

  const selectClass = "h-8 rounded-md border border-input bg-white px-2 text-sm w-full";

  return (
    <>
    <DuplicateWarningDialog
      open={dupCandidates.length > 0}
      entityLabel="Drone"
      duplicates={dupCandidates}
      onConfirm={() => { confirmedRef.current = true; setDupCandidates([]); doSave(); }}
      onCancel={() => setDupCandidates([])}
    />
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
      <div className="space-y-1.5"><Label>Description</Label><Input value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Cost Per Acre ($)</Label><Input type="number" step="0.01" value={costAcre} onChange={(e) => setCostAcre(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Mobilization Cost ($)</Label><Input type="number" step="0.01" value={mobCost} onChange={(e) => setMobCost(e.target.value)} /></div>

      <div className="space-y-2 pt-2 border-t">
        <div className="flex items-center justify-between">
          <Label>Task Templates</Label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={openLibrary}
              className="text-xs text-slate-600 hover:text-slate-900 font-medium underline underline-offset-2"
            >
              Pick from library
            </button>
            <button
              type="button"
              onClick={addTemplate}
              className="text-xs text-emerald-700 hover:text-emerald-900 font-medium"
            >
              + Add Template
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Tasks auto-created from these templates when this drone is assigned to an experiment.
        </p>

        {libraryOpen && (
          <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
            <p className="text-xs font-medium text-slate-700">Select from library:</p>
            {libraryLoading && <p className="text-xs text-slate-400">Loading...</p>}
            {!libraryLoading && library.length === 0 && (
              <p className="text-xs text-slate-400 italic">No library templates yet. Create some at Reference Data → Task Templates.</p>
            )}
            {library.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(t.id)}
                  onChange={() => toggleLibraryItem(t.id)}
                  className="rounded"
                />
                <span className="flex-1">{t.description}</span>
                {t.classification && <span className="text-xs text-slate-400">{t.classification}</span>}
                <span className="text-xs text-slate-400">{t.priority}</span>
              </label>
            ))}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={addFromLibrary}
                disabled={selected.size === 0}
                className="text-xs bg-emerald-600 text-white px-3 py-1 rounded-md disabled:opacity-40 hover:bg-emerald-700"
              >
                Add selected ({selected.size})
              </button>
              <button
                type="button"
                onClick={() => { setLibraryOpen(false); setSelected(new Set()); }}
                className="text-xs text-slate-500 hover:text-slate-800 px-2"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {templates.length === 0 && (
          <p className="text-xs text-slate-400 italic">No templates yet.</p>
        )}
        {templates.map((t, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
            <Input
              value={t.description}
              onChange={(e) => updateTemplate(i, "description", e.target.value)}
              placeholder="Task description"
              required={false}
            />
            <select
              value={t.classification}
              onChange={(e) => updateTemplate(i, "classification", e.target.value)}
              className={selectClass}
            >
              <option value="">— type —</option>
              {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={t.priority}
              onChange={(e) => updateTemplate(i, "priority", e.target.value)}
              className={selectClass}
            >
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <button
              type="button"
              onClick={() => removeTemplate(i)}
              className="text-slate-400 hover:text-red-500 text-sm leading-none px-1"
              aria-label="Remove"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <Button type="submit" disabled={saving} className="w-full">{saving ? "Saving..." : droneId ? "Update" : "Create"}</Button>
    </form>
    </>
  );
}
