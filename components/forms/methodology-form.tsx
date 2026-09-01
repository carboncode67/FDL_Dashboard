"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface MethodologyFormProps {
  onSuccess?: () => void;
  methodologyId?: number;
  initialData?: {
    title?: string;
    body?: string;
  };
}

export function MethodologyForm({ onSuccess, methodologyId, initialData }: MethodologyFormProps) {
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [body, setBody] = useState(initialData?.body ?? "");
  const [saving, setSaving] = useState(false);

  const textareaClass = "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring resize-y min-h-[160px]";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch(methodologyId ? `/api/methodologies/${methodologyId}` : "/api/methodologies", {
        method: methodologyId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      onSuccess?.();
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Standard Soil Sampling Procedure" />
      </div>
      <div className="space-y-1.5">
        <Label>Body</Label>
        <textarea
          className={textareaClass}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          placeholder="Describe the procedure (markdown supported). Tests and Equipment link to this and can override it locally."
        />
      </div>
      <Button type="submit" disabled={saving} className="w-full">
        {saving ? "Saving..." : methodologyId ? "Update" : "Create"}
      </Button>
    </form>
  );
}
