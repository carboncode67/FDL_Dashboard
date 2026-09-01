"use client";

import { useEffect, useState } from "react";

export interface MethodologyOption {
  id: number;
  title: string;
  body: string;
}

interface MethodologySelectProps {
  value: number | null;
  onChange: (id: number | null) => void;
  /** Text for the empty option. */
  placeholder?: string;
  className?: string;
  /** Called after a new methodology is created inline, so parents can refresh caches. */
  onCreated?: (m: MethodologyOption) => void;
}

/**
 * Dropdown of shared Methodologies library entries with an inline "+ New"
 * creator. Used by both the Test form (wrapped by MethodologyPicker, which
 * adds an override textarea) and the Equipment form (plain link, no override).
 */
export function MethodologySelect({
  value, onChange, placeholder = "— none —", className, onCreated,
}: MethodologySelectProps) {
  const [options, setOptions] = useState<MethodologyOption[]>([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/methodologies").then((r) => r.json()).then(setOptions).catch(() => {});
  }, []);

  async function createNew() {
    if (!title.trim() || !body.trim()) {
      setError("Title and body are both required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/methodologies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body: body.trim() }),
      });
      if (!res.ok) {
        setError("Could not create methodology.");
        return;
      }
      const m: MethodologyOption = await res.json();
      setOptions((prev) => [...prev, m].sort((a, b) => a.title.localeCompare(b.title)));
      onChange(m.id);
      onCreated?.(m);
      setCreating(false);
      setTitle("");
      setBody("");
    } finally {
      setSaving(false);
    }
  }

  const textareaClass =
    "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring resize-y min-h-[90px]";

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value ? parseInt(e.target.value) : null)}
          className="h-8 flex-1 rounded-md border border-input bg-white px-2 text-sm"
        >
          <option value="">{placeholder}</option>
          {options.map((m) => (
            <option key={m.id} value={m.id}>{m.title}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => { setCreating((c) => !c); setError(null); }}
          className="text-xs text-emerald-700 hover:text-emerald-900 font-medium whitespace-nowrap"
        >
          {creating ? "Cancel" : "+ New"}
        </button>
      </div>

      {creating && (
        <div className="mt-2 border rounded-lg p-3 bg-slate-50 space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Methodology title"
            className="h-8 w-full rounded-md border border-input bg-white px-2 text-sm"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Describe the procedure (markdown supported)"
            className={textareaClass}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="button"
            onClick={createNew}
            disabled={saving}
            className="text-xs bg-emerald-600 text-white px-3 py-1 rounded-md disabled:opacity-40 hover:bg-emerald-700"
          >
            {saving ? "Creating…" : "Create & link"}
          </button>
        </div>
      )}
    </div>
  );
}
