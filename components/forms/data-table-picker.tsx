"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import Link from "next/link";

interface DataTableOption {
  id: number;
  name: string;
  test_id: number | null;
  drone_id: number | null;
  homeTestName: string | null;
  homeDroneName: string | null;
}

interface DataTablePickerProps {
  testId?: number;
  selectedIds: Set<number>;
  onChange: (ids: Set<number>) => void;
}

// Lets a Test attach existing/shared DataTables (its own already-homed tables
// don't need this — they're implicitly usable, see the Data Sources section
// on the test edit page).
export function DataTablePicker({ testId, selectedIds, onChange }: DataTablePickerProps) {
  const [options, setOptions] = useState<DataTableOption[]>([]);

  useEffect(() => {
    fetch("/api/data-tables").then((r) => r.json()).then(setOptions);
  }, []);

  const pickable = options.filter((t) => t.test_id !== testId);

  function toggle(id: number) {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(next);
  }

  return (
    <div className="space-y-2 pt-2 border-t">
      <div className="flex items-center justify-between">
        <Label>Data Sources</Label>
        <Link href="/data-tables" className="text-xs text-slate-600 hover:text-slate-900 underline underline-offset-2">
          Manage Data Tables
        </Link>
      </div>
      <p className="text-xs text-slate-500">
        Shared or equipment-linked data tables this test also collects data through.
      </p>
      {pickable.length === 0 ? (
        <p className="text-xs text-slate-400 italic">No other data tables yet.</p>
      ) : (
        <div className="border rounded-lg p-3 space-y-1.5 max-h-40 overflow-y-auto">
          {pickable.map((t) => (
            <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.has(t.id)}
                onChange={() => toggle(t.id)}
                className="rounded"
              />
              <span className="flex-1">{t.name}</span>
              {t.homeDroneName && <span className="text-xs text-slate-400">{t.homeDroneName}</span>}
              {t.homeTestName && <span className="text-xs text-slate-400">{t.homeTestName}</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
