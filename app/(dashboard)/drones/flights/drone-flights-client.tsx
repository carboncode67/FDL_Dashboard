"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { DroneFlightRecordForm, type DroneFlightRecordData } from "@/components/forms/drone-flight-record-form";

const STATUS_COLORS: Record<string, string> = {
  "Scheduled":      "bg-blue-100 text-blue-700",
  "Data Collected": "bg-yellow-100 text-yellow-700",
  "Processing":     "bg-orange-100 text-orange-700",
  "Annotating":     "bg-purple-100 text-purple-700",
  "Completed":      "bg-green-100 text-green-700",
  "Cancelled":      "bg-red-100 text-red-700",
};

export interface FlightRow {
  id: number;
  experiment_drone_flight_id: number;
  drone_name: string | null;
  farm_id: number | null;
  farm_name: string | null;
  experiment_id: number | null;
  experiment_name: string | null;
  flight_date: string | null;
  pilot: string | null;
  flight_status: string | null;
  total_acres: number | null;
  total_images: number | null;
  needs_3d: boolean;
  needs_ortho: boolean;
  processed: boolean;
  data_storage_path: string | null;
  tile_coverage_pct: number | null;
  tile_size_m: number | null;
  notes: string | null;
}

export function DroneFlightsClient({ data }: { data: FlightRow[] }) {
  const router = useRouter();
  const [editRecord, setEditRecord] = useState<FlightRow | null>(null);

  const columns = [
    {
      key: "drone_name",
      header: "Drone",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as FlightRow;
        return <span className="font-medium">{r.drone_name ?? "—"}</span>;
      },
    },
    {
      key: "farm_name",
      header: "Farm",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as FlightRow;
        if (!r.farm_id) return <span className="text-slate-400">—</span>;
        return (
          <Link
            href={`/farms/${r.farm_id}`}
            className="text-blue-600 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {r.farm_name ?? `Farm #${r.farm_id}`}
          </Link>
        );
      },
    },
    {
      key: "experiment_name",
      header: "Experiment",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as FlightRow;
        if (!r.experiment_id || !r.farm_id) return <span className="text-slate-400">—</span>;
        return (
          <Link
            href={`/farms/${r.farm_id}/experiments/${r.experiment_id}`}
            className="text-blue-600 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {r.experiment_name ?? `Experiment #${r.experiment_id}`}
          </Link>
        );
      },
    },
    {
      key: "flight_date",
      header: "Flight Date",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as FlightRow;
        return <span>{r.flight_date ? new Date(r.flight_date + "T00:00:00").toLocaleDateString() : "—"}</span>;
      },
    },
    {
      key: "flight_status",
      header: "Status",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as FlightRow;
        if (!r.flight_status) return <span className="text-slate-400">—</span>;
        const cls = STATUS_COLORS[r.flight_status] ?? "bg-slate-100 text-slate-700";
        return (
          <Badge variant="outline" className={`text-xs ${cls}`}>
            {r.flight_status}
          </Badge>
        );
      },
    },
    {
      key: "total_acres",
      header: "Acres",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as FlightRow;
        return <span>{r.total_acres != null ? r.total_acres.toLocaleString() : "—"}</span>;
      },
    },
    {
      key: "total_images",
      header: "Images",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as FlightRow;
        return <span>{r.total_images != null ? r.total_images.toLocaleString() : "—"}</span>;
      },
    },
    {
      key: "_outputs",
      header: "Outputs",
      render: (row: Record<string, unknown>) => {
        const r = row as unknown as FlightRow;
        const tags: string[] = [];
        if (r.needs_3d)    tags.push("3D");
        if (r.needs_ortho) tags.push("Ortho");
        if (!tags.length)  return <span className="text-slate-400">—</span>;
        return (
          <div className="flex gap-1">
            {tags.map((t) => (
              <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
            ))}
            {r.processed && (
              <Badge variant="outline" className="text-xs bg-green-100 text-green-700">Done</Badge>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <DataTable
        title="Drone Flights"
        data={data as unknown as Record<string, unknown>[]}
        columns={columns}
        searchKeys={["drone_name", "farm_name", "experiment_name", "pilot", "flight_status"]}
        onRowClick={(row) => setEditRecord(row as unknown as FlightRow)}
      />

      {editRecord && (
        <DroneFlightRecordForm
          open
          onClose={() => { setEditRecord(null); router.refresh(); }}
          experimentDroneFlightId={editRecord.experiment_drone_flight_id}
          record={editRecord as unknown as DroneFlightRecordData}
        />
      )}
    </>
  );
}
