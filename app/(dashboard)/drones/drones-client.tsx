"use client";

import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

interface DroneRow { id: number; Name: string | null; Cost_Per_Acre: number | null; Mobilization_Cost: number | null; Description: string | null }

export function DronesClient({ data }: { data: DroneRow[] }) {
  const router = useRouter();

  const columns = [
    { key: "Name", header: "Name" },
    {
      key: "Cost_Per_Acre",
      header: "Cost/Acre",
      render: (row: Record<string, unknown>) => {
        const c = (row as unknown as DroneRow).Cost_Per_Acre;
        return <span>{c != null ? `$${c.toLocaleString()}` : "—"}</span>;
      },
    },
    {
      key: "Mobilization_Cost",
      header: "Mobilization Cost",
      render: (row: Record<string, unknown>) => {
        const c = (row as unknown as DroneRow).Mobilization_Cost;
        return <span>{c != null ? `$${c.toLocaleString()}` : "—"}</span>;
      },
    },
    {
      key: "_actions",
      header: "",
      render: (row: Record<string, unknown>) => (
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); router.push(`/drones/${(row as unknown as DroneRow).id}/edit`); }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      title="Drones"
      data={data as unknown as Record<string, unknown>[]}
      columns={columns}
      searchKeys={["Name"]}
      onAdd={() => router.push("/drones/new")}
      addLabel="New Drone"
    />
  );
}
