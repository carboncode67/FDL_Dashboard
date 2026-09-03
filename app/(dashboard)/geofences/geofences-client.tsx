"use client";

import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";

interface GeofenceRow {
  id: number;
  title: string;
  is_active: boolean;
  zone_count: number;
  assignment_count: number;
  event_count: number;
}

export function GeofencesClient({ data }: { data: GeofenceRow[] }) {
  const router = useRouter();

  const columns = [
    { key: "title", header: "Title", sortable: true },
    {
      key: "is_active",
      header: "Status",
      render: (row: Record<string, unknown>) => {
        const active = (row as unknown as GeofenceRow).is_active;
        return <Badge variant={active ? "default" : "outline"}>{active ? "Active" : "Inactive"}</Badge>;
      },
    },
    {
      key: "zone_count",
      header: "Zones",
      render: (row: Record<string, unknown>) => <span>{(row as unknown as GeofenceRow).zone_count}</span>,
    },
    {
      key: "assignment_count",
      header: "Assigned To",
      render: (row: Record<string, unknown>) => <span>{(row as unknown as GeofenceRow).assignment_count}</span>,
    },
    {
      key: "event_count",
      header: "Events",
      render: (row: Record<string, unknown>) => <span>{(row as unknown as GeofenceRow).event_count}</span>,
    },
  ];

  return (
    <DataTable
      title="Geofences"
      data={data as unknown as Record<string, unknown>[]}
      columns={columns}
      searchKeys={["title"]}
      onAdd={() => router.push("/geofences/new")}
      addLabel="New Geofence"
      onRowClick={(row) => router.push(`/geofences/${(row as unknown as GeofenceRow).id}/edit`)}
    />
  );
}
