"use client";

import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

interface FarmRow {
  id: number;
  Farm_Name: string | null;
  Farmer_Name: string | null;
  County: string | null;
  State: string | null;
}

export function FarmsClient({ data }: { data: FarmRow[] }) {
  const router = useRouter();

  const columns = [
    { key: "Farm_Name", header: "Farm Name" },
    { key: "Farmer_Name", header: "Farmer Name" },
    { key: "County", header: "County" },
    { key: "State", header: "State" },
    {
      key: "_actions",
      header: "",
      render: (row: Record<string, unknown>) => (
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); router.push(`/farms/${(row as unknown as FarmRow).id}/edit`); }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      title="Farms"
      data={data as unknown as Record<string, unknown>[]}
      columns={columns}
      searchKeys={["Farm_Name", "Farmer_Name", "County", "State"]}
      onAdd={() => router.push("/farms/new")}
      addLabel="New Farm"
      onRowClick={(row) => router.push(`/farms/${(row as unknown as FarmRow).id}`)}
    />
  );
}
