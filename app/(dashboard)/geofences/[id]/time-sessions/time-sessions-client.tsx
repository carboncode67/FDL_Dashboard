"use client";

import { DataTable } from "@/components/data-table";
import Link from "next/link";

interface Props {
  geofence: { id: number; title: string };
  sessions: {
    id: number;
    recipient: string;
    farm_name: string;
    field_name: string | null;
    entered_at: string;
    exited_at: string;
    duration_seconds: number;
    received_at: string;
  }[];
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function TimeSessionsClient({ geofence, sessions }: Props) {
  const columns = [
    { key: "recipient", header: "Recipient", sortable: true },
    { key: "farm_name", header: "Farm", sortable: true },
    {
      key: "field_name",
      header: "Field",
      sortable: true,
      render: (row: Record<string, unknown>) =>
        <span>{(row as unknown as (typeof sessions)[number]).field_name ?? "Whole zone"}</span>,
    },
    {
      key: "entered_at",
      header: "Entered At",
      sortable: true,
      render: (row: Record<string, unknown>) =>
        <span>{new Date((row as unknown as (typeof sessions)[number]).entered_at).toLocaleString()}</span>,
    },
    {
      key: "exited_at",
      header: "Exited At",
      sortable: true,
      render: (row: Record<string, unknown>) =>
        <span>{new Date((row as unknown as (typeof sessions)[number]).exited_at).toLocaleString()}</span>,
    },
    {
      key: "duration_seconds",
      header: "Duration",
      sortable: true,
      render: (row: Record<string, unknown>) =>
        <span>{formatDuration((row as unknown as (typeof sessions)[number]).duration_seconds)}</span>,
    },
    {
      key: "received_at",
      header: "Reported At",
      sortable: true,
      render: (row: Record<string, unknown>) =>
        <span>{new Date((row as unknown as (typeof sessions)[number]).received_at).toLocaleString()}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-sm text-stone-500 mb-1">
          <Link href="/geofences" className="hover:text-stone-900">Geofences</Link>
          <span>/</span>
          <Link href={`/geofences/${geofence.id}/edit`} className="hover:text-stone-900">{geofence.title}</Link>
          <span>/</span>
          <span>Time Sessions</span>
        </div>
        <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-stone-500 mt-1">
          Chronological log of confirmed on-device zone visits and how long each lasted — not a
          per-recipient completion status.
        </p>
        <a
          href={`/api/geofences/${geofence.id}/time-sessions/export`}
          download
          className="shrink-0 inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-50"
        >
          Download CSV
        </a>
        </div>
      </div>
      <DataTable
        title={`${geofence.title} — Time Sessions`}
        data={sessions as unknown as Record<string, unknown>[]}
        columns={columns}
        searchKeys={["recipient", "farm_name", "field_name"]}
      />
    </div>
  );
}
