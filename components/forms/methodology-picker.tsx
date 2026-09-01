"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { MethodologySelect, type MethodologyOption } from "@/components/forms/methodology-select";

interface MethodologyPickerProps {
  methodologyId: number | null;
  onMethodologyIdChange: (id: number | null) => void;
  override: string;
  onOverrideChange: (value: string) => void;
}

export function MethodologyPicker({
  methodologyId, onMethodologyIdChange, override, onOverrideChange,
}: MethodologyPickerProps) {
  const [options, setOptions] = useState<MethodologyOption[]>([]);

  useEffect(() => {
    fetch("/api/methodologies").then((r) => r.json()).then(setOptions).catch(() => {});
  }, []);

  const linked = options.find((m) => m.id === methodologyId) ?? null;
  const textareaClass = "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring resize-y min-h-[100px]";

  return (
    <div className="space-y-1.5">
      <Label>Methodology</Label>
      <MethodologySelect
        value={methodologyId}
        onChange={onMethodologyIdChange}
        placeholder="— none linked —"
        onCreated={(m) => setOptions((prev) => [...prev, m].sort((a, b) => a.title.localeCompare(b.title)))}
      />
      {linked && (
        <p className="text-xs text-slate-500">
          Linked to shared library entry &quot;{linked.title}&quot; (Reference Data → Methodologies). Text
          below overrides it when filled in; leave blank to use the library text as-is.
        </p>
      )}
      <textarea
        className={textareaClass}
        value={override}
        onChange={(e) => onOverrideChange(e.target.value)}
        placeholder={
          linked
            ? "Leave blank to use the linked library text, or enter an override (markdown supported)"
            : "Describe the methodology (markdown supported), or link a shared library entry above"
        }
      />
    </div>
  );
}
