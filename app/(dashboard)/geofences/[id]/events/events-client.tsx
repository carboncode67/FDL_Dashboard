"use client";

import { DataTable } from "@/components/data-table";
import Link from "next/link";

interface Props {
  geofence: { id: number; title: string };
  events: {
    id: number;
    recipient: string;
    lat: number;
    lng: number;
    occurred_at: string;
    received_at: string;
  }[];
}

export default function EventsClient({ geofence, events }: Props) {
  const columns = [
    { key: "recipient", header: "Recipient", sortable: true },
    {
      key: "occurred_at",
      header: "Entered At",
      sortable: true,
      render: (row: Record<string, unknown>) =>
        <span>{new Date((row as unknown as (typeof events)[number]).occurred_at).toLocaleString()}</span>,
    },
    {
      key: "location",
      header: "Location",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as (typeof events)[number];
        return <span className="text-xs text-slate-500">{r.lat.toFixed(5)}, {r.lng.toFixed(5)}</span>;
      },
    },
    {
      key: "received_at",
      header: "Reported At",
      sortable: true,
      render: (row: Record<string, unknown>) =>
        <span>{new Date((row as unknown as (typeof events)[number]).received_at).toLocaleString()}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/geofences" className="hover:text-slate-900">Geofences</Link>
          <span>/</span>
          <Link href={`/geofences/${geofence.id}/edit`} className="hover:text-slate-900">{geofence.title}</Link>
          <span>/</span>
          <span>Events</span>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Chronological log of confirmed on-device entries — not a per-recipient completion status.
        </p>
      </div>
      <DataTable
        title={`${geofence.title} — Events`}
        data={events as unknown as Record<string, unknown>[]}
        columns={columns}
        searchKeys={["recipient"]}
      />
    </div>
  );
}
