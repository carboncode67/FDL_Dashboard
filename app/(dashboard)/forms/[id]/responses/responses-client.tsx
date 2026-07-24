"use client";

import { DataTable } from "@/components/data-table";
import Link from "next/link";

interface Props {
  form: { id: number; title: string };
  fields: { col_index: number; label: string; field_type: string }[];
  responses: {
    id: number;
    data: Record<string, string | number | boolean | null>;
    photoFilenames: Record<string, string | null>;
    submitted_at: string;
    recipient: string;
  }[];
}

export default function ResponsesClient({ form, fields, responses }: Props) {
  const columns = [
    { key: "recipient", header: "Recipient", sortable: true },
    {
      key: "submitted_at",
      header: "Submitted",
      sortable: true,
      render: (row: Record<string, unknown>) =>
        <span>{new Date((row as unknown as (typeof responses)[number]).submitted_at).toLocaleString()}</span>,
    },
    ...fields.map((f) => ({
      key: `field_${f.col_index}`,
      header: f.label,
      render: (row: Record<string, unknown>) => {
        const typedRow = row as unknown as (typeof responses)[number];
        const value = typedRow.data[String(f.col_index)];
        if (value === null || value === undefined) return <span className="text-slate-400">—</span>;
        if (f.field_type === "photo") {
          const filename = typedRow.photoFilenames[String(f.col_index)];
          if (!filename) return <span className="text-xs text-amber-600">Uploading…</span>;
          return (
            <a href={`/api/files/photos/${filename}`} target="_blank" rel="noopener noreferrer">
              <img
                src={`/api/files/photos/${filename}`}
                alt=""
                className="h-12 w-12 rounded object-cover"
              />
            </a>
          );
        }
        return <span>{String(value)}</span>;
      },
    })),
  ];

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/forms" className="hover:text-slate-900">Custom Forms</Link>
          <span>/</span>
          <Link href={`/forms/${form.id}/edit`} className="hover:text-slate-900">{form.title}</Link>
          <span>/</span>
          <span>Responses</span>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Forms are repeatable — this is a chronological log of every submission, not a per-recipient
          completion status.
        </p>
      </div>
      <DataTable
        title={`${form.title} — Responses`}
        data={responses as unknown as Record<string, unknown>[]}
        columns={columns}
        searchKeys={["recipient"]}
      />
    </div>
  );
}
