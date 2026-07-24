"use client";

import { DataTable } from "@/components/data-table";
import Link from "next/link";

interface Props {
  form: { id: number; title: string };
  fields: { col_index: number; label: string }[];
  responses: {
    id: number;
    data: Record<string, string | number | boolean | null>;
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
        const value = (row as unknown as (typeof responses)[number]).data[String(f.col_index)];
        return <span>{value === null || value === undefined ? "—" : String(value)}</span>;
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
