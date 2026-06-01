"use client";

import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

interface CropRow { id: number; Crop_Name: string | null; Crop_Type: string | null }

export function CropsClient({ data }: { data: CropRow[] }) {
  const router = useRouter();

  const columns = [
    { key: "Crop_Name", header: "Crop Name" },
    { key: "Crop_Type", header: "Crop Type" },
    {
      key: "_actions",
      header: "",
      render: (row: Record<string, unknown>) => (
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); router.push(`/crops/${(row as unknown as CropRow).id}/edit`); }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      title="Crops"
      data={data as unknown as Record<string, unknown>[]}
      columns={columns}
      searchKeys={["Crop_Name", "Crop_Type"]}
      onAdd={() => router.push("/crops/new")}
      addLabel="New Crop"
    />
  );
}
