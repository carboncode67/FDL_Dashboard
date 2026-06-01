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

interface FieldOption { id: number; name: string }

interface ExperimentZoneFormProps {
  onSuccess?: () => void;
  zoneId?: number;
  fields?: FieldOption[];
  initialData?: {
    Zone_Label?: string | null;
    Rep_Number?: number | null;
    Fields_id?: number | null;
  };
}

export function ExperimentZoneForm({ onSuccess, zoneId, fields = [], initialData }: ExperimentZoneFormProps) {
  const [label, setLabel] = useState(initialData?.Zone_Label ?? "");
  const [rep, setRep] = useState(initialData?.Rep_Number?.toString() ?? "");
  const [fieldsId, setFieldsId] = useState(initialData?.Fields_id?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch(zoneId ? `/api/experiment-zones/${zoneId}` : "/api/experiment-zones", {
        method: zoneId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Zone_Label: label,
          Rep_Number: rep ? parseInt(rep) : null,
          Fields_id: fieldsId ? parseInt(fieldsId) : null,
        }),
      });
      onSuccess?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Zone Label</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label>Rep Number</Label>
        <Input type="number" value={rep} onChange={(e) => setRep(e.target.value)} />
      </div>
      {fields.length > 0 && (
        <div className="space-y-1.5">
          <Label>Field</Label>
          <Select value={fieldsId} onValueChange={(v) => setFieldsId(v ?? "")}>
            <SelectTrigger>
              <SelectValue placeholder="Select a field..." />
            </SelectTrigger>
            <SelectContent>
              {fields.map((f) => (
                <SelectItem key={f.id} value={f.id.toString()}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <Button type="submit" disabled={saving} className="w-full">
        {saving ? "Saving..." : zoneId ? "Update" : "Create"}
      </Button>
    </form>
  );
}
