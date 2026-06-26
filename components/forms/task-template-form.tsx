"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const CLASSIFICATIONS = [
  "image annotation", "ocr", "transcription", "categorization",
  "photogrammetric processing", "image classification", "spatial analysis",
  "data cleaning", "sampling", "drone flight", "tiling",
];
const PRIORITIES = ["low", "medium", "high"];

interface TaskTemplateFormProps {
  onSuccess?: () => void;
  templateId?: number;
  initialData?: {
    description?: string;
    classification?: string | null;
    priority?: string;
  };
}

export function TaskTemplateForm({ onSuccess, templateId, initialData }: TaskTemplateFormProps) {
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [classification, setClassification] = useState(initialData?.classification ?? "");
  const [priority, setPriority] = useState(initialData?.priority ?? "medium");
  const [saving, setSaving] = useState(false);

  const selectClass = "h-9 w-full rounded-md border border-input bg-white px-2 text-sm";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch(templateId ? `/api/task-templates/${templateId}` : "/api/task-templates", {
        method: templateId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          classification: classification || null,
          priority,
        }),
      });
      onSuccess?.();
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="e.g. Collect samples" />
      </div>
      <div className="space-y-1.5">
        <Label>Classification</Label>
        <select value={classification} onChange={(e) => setClassification(e.target.value)} className={selectClass}>
          <option value="">— none —</option>
          {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>Priority</Label>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={selectClass}>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <Button type="submit" disabled={saving} className="w-full">
        {saving ? "Saving..." : templateId ? "Update" : "Create"}
      </Button>
    </form>
  );
}
