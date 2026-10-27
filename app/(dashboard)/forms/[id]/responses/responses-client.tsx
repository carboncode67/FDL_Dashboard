"use client";

import { DataTable } from "@/components/data-table";
import Link from "next/link";

interface Props {
  form: { id: number; title: string };
  fields: { field_key: string; label: string; field_type: string; removed: boolean }[];
  responses: {
    id: number;
    data: Record<string, string | number | boolean | string[] | null>;
    photoFilenames: Record<string, string | null>;
    submitted_at: string;
    olderFormVersion: boolean;
    missingRequired: string[];
    recipient: string;
    samplingPoint: { label: string; mapName: string; farmId: number; mapId: number } | null;
  }[];
}

export default function ResponsesClient({ form, fields, responses }: Props) {
  const columns = [
    { key: "recipient", header: "Recipient", sortable: true },
    {
      key: "samplingPoint",
      header: "Sampling Point",
      render: (row: Record<string, unknown>) => {
        const sp = (row as unknown as (typeof responses)[number]).samplingPoint;
        if (!sp) return <span className="text-stone-400">—</span>;
        return (
          <Link href={`/farms/${sp.farmId}/maps/${sp.mapId}`} className="text-sm hover:underline">
            {sp.label} <span className="text-stone-400">({sp.mapName})</span>
          </Link>
        );
      },
    },
    {
      key: "submitted_at",
      header: "Submitted",
      sortable: true,
      render: (row: Record<string, unknown>) =>
        <span>{new Date((row as unknown as (typeof responses)[number]).submitted_at).toLocaleString()}</span>,
    },
    ...fields.map((f) => ({
      key: `field_${f.field_key}`,
      header: f.removed ? <span className="text-stone-400">{f.label}</span> : f.label,
      render: (row: Record<string, unknown>) => {
        const typedRow = row as unknown as (typeof responses)[number];
        const value = typedRow.data[f.field_key];
        if (value === null || value === undefined) return <span className="text-stone-400">—</span>;
        if (f.field_type === "photo") {
          const filename = typedRow.photoFilenames[f.field_key];
          if (!filename) return <span className="text-xs text-amber-600">Uploading…</span>;
          return (
            <a href={`/api/files/photos/${filename}`} target="_blank" rel="noopener noreferrer">
              <img
                src={`/api/files/photos/${filename}`}
                alt=""
                className="h-12 w-12 rounded object-cover"
                style={{ imageOrientation: "from-image" }}
              />
            </a>
          );
        }
        if (Array.isArray(value)) {
          if (value.length === 0) return <span className="text-stone-400">—</span>;
          return <span>{value.join(", ")}</span>;
        }
        return <span>{String(value)}</span>;
      },
    })),
    ...(responses.some((r) => r.olderFormVersion)
      ? [{
          key: "olderFormVersion",
          header: "Note",
          render: (row: Record<string, unknown>) => {
            const r = row as unknown as (typeof responses)[number];
            if (!r.olderFormVersion) return null;
            const title = r.missingRequired.length > 0
              ? `No answer for: ${r.missingRequired.join(", ")} (added or made required after this was filled out)`
              : "Filled out before the form was last edited — answers were matched to the current fields";
            return (
              <span title={title} className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800 whitespace-nowrap">
                Older form version
              </span>
            );
          },
        }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-sm text-stone-500 mb-1">
          <Link href="/forms" className="hover:text-stone-900">Custom Forms</Link>
          <span>/</span>
          <Link href={`/forms/${form.id}/edit`} className="hover:text-stone-900">{form.title}</Link>
          <span>/</span>
          <span>Responses</span>
        </div>
        <p className="text-sm text-stone-500 mt-1">
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
