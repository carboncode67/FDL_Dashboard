import { randomBytes } from "crypto";
import { normalizeLabel } from "@/lib/forms";

// Custom Form field identity (migration 088). FormResponse.data is keyed by
// FormFieldDefinition.field_key, which never changes once assigned — renames, reorders and
// removals in the builder no longer move answers between fields. Removed fields that still
// hold answers are archived (archived_at), not deleted.

type FieldLike = {
  field_key: string;
  label: string;
  col_index: number;
  archived_at: Date | null;
  previous_labels: string[];
};

/** "f_" prefix keeps generated keys disjoint from the numeric keys 088 backfilled. */
export function newFieldKey(): string {
  return `f_${randomBytes(6).toString("hex")}`;
}

/** Active fields in builder order, then archived ones (oldest removal first) — the column
 *  order for the responses view and CSV exports, so removed fields' past answers stay visible. */
export function fieldsForDisplay<T extends FieldLike>(defs: T[]): T[] {
  const active = defs.filter((d) => !d.archived_at).sort((a, b) => a.col_index - b.col_index);
  const archived = defs
    .filter((d) => d.archived_at)
    .sort((a, b) => a.archived_at!.getTime() - b.archived_at!.getTime() || a.col_index - b.col_index);
  return [...active, ...archived];
}

export function fieldDisplayLabel(def: Pick<FieldLike, "label" | "archived_at">): string {
  return def.archived_at ? `${def.label} (removed)` : def.label;
}

export interface FieldMatch<T> {
  def: T;
  /** False when matched through a previous label or an archived field — i.e. the submission
   *  was filled out against an older version of the form. */
  current: boolean;
}

/** Resolves a submitted label to a field, most-specific first: an active field's current
 *  label, an active field's previous label, an archived field's label, then an archived
 *  field's previous label. Earlier tiers win, so a new field reusing an old name takes it. */
export function buildFieldMatcher<T extends FieldLike>(defs: T[]): (label: string) => FieldMatch<T> | null {
  const tiers: Map<string, T>[] = [new Map(), new Map(), new Map(), new Map()];
  const put = (tier: number, label: string, def: T) => {
    const norm = normalizeLabel(label);
    if (norm && !tiers[tier].has(norm)) tiers[tier].set(norm, def);
  };
  // Most recently archived first, so a label reused across several removed fields resolves
  // to the latest one.
  const archived = defs
    .filter((d) => d.archived_at)
    .sort((a, b) => b.archived_at!.getTime() - a.archived_at!.getTime());
  for (const d of defs.filter((x) => !x.archived_at)) {
    put(0, d.label, d);
    for (const l of d.previous_labels) put(1, l, d);
  }
  for (const d of archived) {
    put(2, d.label, d);
    for (const l of d.previous_labels) put(3, l, d);
  }
  return (label: string) => {
    const norm = normalizeLabel(label);
    for (let i = 0; i < tiers.length; i++) {
      const def = tiers[i].get(norm);
      if (def) return { def, current: i === 0 };
    }
    return null;
  };
}
