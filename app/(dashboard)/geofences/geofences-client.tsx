"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Timer, Bell } from "lucide-react";

interface GeofenceRow {
  id: number;
  title: string;
  is_active: boolean;
  geofence_type: string;
  zone_count: number;
  assignment_count: number;
  event_count: number;
}

const TYPE_LABEL: Record<string, string> = { duration: "Duration", notification: "Notification" };

export function GeofencesClient({ data }: { data: GeofenceRow[] }) {
  const router = useRouter();

  const columns = [
    { key: "title", header: "Title", sortable: true },
    {
      key: "geofence_type",
      header: "Type",
      render: (row: Record<string, unknown>) => {
        const type = (row as unknown as GeofenceRow).geofence_type;
        return <Badge variant="outline">{TYPE_LABEL[type] ?? type}</Badge>;
      },
    },
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
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/geofences/new?type=duration">
          <Card className="px-4 h-full cursor-pointer transition-colors hover:bg-accent/50">
            <div className="flex items-start gap-3">
              <Timer className="mt-0.5 size-5 shrink-0 text-stone-500" />
              <div>
                <div className="font-medium">Track Duration Geofence</div>
                <p className="text-sm text-stone-500 mt-1">
                  Set a point + radius zone and automatically log how long the assignee spends inside it.
                </p>
              </div>
            </div>
          </Card>
        </Link>
        <Link href="/geofences/new?type=notification">
          <Card className="px-4 h-full cursor-pointer transition-colors hover:bg-accent/50">
            <div className="flex items-start gap-3">
              <Bell className="mt-0.5 size-5 shrink-0 text-stone-500" />
              <div>
                <div className="font-medium">Notification Geofence</div>
                <p className="text-sm text-stone-500 mt-1">
                  Notify on zone/field entry, optionally deep-linking to a Form or Sampling Map.
                </p>
              </div>
            </div>
          </Card>
        </Link>
      </div>
      <DataTable
        title="Geofences"
        data={data as unknown as Record<string, unknown>[]}
        columns={columns}
        searchKeys={["title"]}
        onRowClick={(row) => router.push(`/geofences/${(row as unknown as GeofenceRow).id}/edit`)}
      />
    </div>
  );
}
