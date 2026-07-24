"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface FormBasicsFormProps {
  onSuccess?: (form: { id: number }) => void;
  formId?: number;
  initialData?: {
    title?: string | null;
    description?: string | null;
  };
}

export function FormBasicsForm({ onSuccess, formId, initialData }: FormBasicsFormProps) {
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(formId ? `/api/forms/${formId}` : "/api/forms", {
        method: formId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description: description || null }),
      });
      const form = await res.json();
      onSuccess?.(form);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <Button type="submit" disabled={saving} className="w-full">
        {saving ? "Saving..." : formId ? "Update" : "Create"}
      </Button>
    </form>
  );
}
