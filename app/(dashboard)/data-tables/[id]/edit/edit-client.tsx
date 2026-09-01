"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DataTableForm } from "@/components/forms/data-table-form";
import { SchemaBuilder } from "@/components/schema-builder";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

type Column = { col_index: number; field_type: "text" | "number"; label: string };

interface Props {
  table: {
    id: number;
    name: string;
    description: string | null;
    data_processing_instructions: string | null;
    test_id: number | null;
    drone_id: number | null;
  };
  homeLabel: string | null;
  usedByTests: string[];
  fieldDefs: Column[];
}

export default function EditDataTableClient({ table, homeLabel, usedByTests, fieldDefs }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete "${table.name}"? This also deletes all its ingested rows.`)) return;
    setDeleting(true);
    await fetch(`/api/data-tables/${table.id}`, { method: "DELETE" });
    router.push("/data-tables");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <Link href="/data-tables" className="hover:text-slate-900">Data Tables</Link>
            <span>/</span>
            <span>Edit</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">{table.name}</h2>
          {homeLabel && <p className="text-sm text-slate-500 mt-1">{homeLabel}</p>}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={handleDelete} disabled={deleting} className="text-red-500 hover:text-red-700 hover:bg-red-50 mt-1">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="bg-white border rounded-lg p-6">
        <DataTableForm
          dataTableId={table.id}
          initialData={table}
          onSuccess={() => router.refresh()}
        />
      </div>

      <div className="bg-white border rounded-lg p-6 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b">Data Template</h3>
        <SchemaBuilder endpoint={`/api/data-tables/${table.id}/schema`} initialColumns={fieldDefs} />
      </div>

      {usedByTests.length > 0 && (
        <div className="bg-white border rounded-lg p-6 space-y-2">
          <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b">Also Used By</h3>
          <ul className="text-sm list-disc list-inside space-y-0.5">
            {usedByTests.map((name, i) => <li key={i}>{name}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
