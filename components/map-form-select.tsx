"use client";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface MapFormOption {
  id: number;
  title: string;
}

// What the user picked in a New Sampling Map dialog: no form, an existing form, or a brand-new
// one to create on submit. "new" exists so a map's survey doesn't have to be built before the map
// — the form is created blank (title only) and its questions are added later from the editor's
// "Edit form" link. Resolved to a Sampling_Maps.form_id by resolveMapFormId() below.
export type MapFormChoice =
  | { kind: "none" }
  | { kind: "existing"; id: number }
  | { kind: "new"; title: string };

export const NO_MAP_FORM: MapFormChoice = { kind: "none" };

const NEW_VALUE = "__new__";

export function MapFormSelect({
  forms,
  value,
  onChange,
}: {
  forms: MapFormOption[];
  value: MapFormChoice;
  onChange: (value: MapFormChoice) => void;
}) {
  const selectValue =
    value.kind === "existing" ? String(value.id) : value.kind === "new" ? NEW_VALUE : "none";

  return (
    <div className="space-y-2">
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (!v || v === "none") onChange(NO_MAP_FORM);
          else if (v === NEW_VALUE) onChange({ kind: "new", title: "" });
          else onChange({ kind: "existing", id: parseInt(v) });
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="Linked Form: None" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none" label="Linked Form: None">
            Linked Form: None
          </SelectItem>
          {forms.map((f) => (
            <SelectItem key={f.id} value={String(f.id)} label={f.title}>
              {f.title}
            </SelectItem>
          ))}
          <SelectItem value={NEW_VALUE} label="+ New form…">
            + New form…
          </SelectItem>
        </SelectContent>
      </Select>
      {value.kind === "new" && (
        <Input
          value={value.title}
          onChange={(e) => onChange({ kind: "new", title: e.target.value })}
          placeholder="New form title…"
          autoFocus
        />
      )}
    </div>
  );
}

// Creates the form first when the choice is "new" (POST /api/forms, title only), then returns
// the id to send as the map's form_id. Throws with the API's error message on failure.
export async function resolveMapFormId(choice: MapFormChoice): Promise<number | null> {
  if (choice.kind === "none") return null;
  if (choice.kind === "existing") return choice.id;
  const res = await fetch("/api/forms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: choice.title.trim() }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? "Failed to create form");
  }
  const form = await res.json();
  return form.id;
}

export function isMapFormChoiceComplete(choice: MapFormChoice): boolean {
  return choice.kind !== "new" || choice.title.trim() !== "";
}
