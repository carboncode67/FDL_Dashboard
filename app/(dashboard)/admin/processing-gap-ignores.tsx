"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { dataProductLabel } from "@/lib/data-products";

interface Ignore {
  id: number;
  data_product: string;
  note: string | null;
}

/**
 * Data types this lab told the dashboard never to flag as "Unprocessable data"
 * (migration 102). Added from a flag's "Never flag …" button on Data Sorting;
 * removed here.
 */
export function ProcessingGapIgnores({ initialRows }: { initialRows: Ignore[] }) {
  const [rows, setRows] = useState<Ignore[]>(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/processing-gaps/ignores");
    if (res.ok) setRows(await res.json());
    else setError("Couldn't load ignored types");
  }
  async function remove(product: string) {
    setBusy(product);
    setError(null);
    const res = await fetch(`/api/processing-gaps/ignores?data_product=${encodeURIComponent(product)}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) setError("Couldn't remove it");
    else load();
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-stone-700">Unprocessable-data flags: ignored types</p>
      <p className="text-xs text-stone-500">
        Data Sleuth flags sorted uploads that look like data no processing tool covers. These types are never flagged in
        this lab. Removing one doesn&apos;t re-open flags it dismissed; new uploads of the type are flagged again.
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-stone-400">None. Every data type is flagged.</p>
      ) : (
        <ul className="divide-y divide-stone-100 rounded-md border border-stone-200">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="font-medium">{dataProductLabel(r.data_product)}</span>
              {r.note && <span className="text-xs text-stone-500 truncate">{r.note}</span>}
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                disabled={busy === r.data_product}
                onClick={() => remove(r.data_product)}
              >
                Stop ignoring
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
