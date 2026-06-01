"use client";

import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

interface ZoneRow {
  id: number;
  Zone_Label: string | null;
  Project_Name: string | null;
  Farm_Name: string | null;
  Field_Name: string | null;
  Rep_Number: number | null;
  hasGeometry: boolean;
}

export function ExperimentZonesClient({ data }: { data: ZoneRow[] }) {
  const router = useRouter();

  const columns = [
    { key: "Zone_Label", header: "Zone Label" },
    { key: "Project_Name", header: "Project" },
    { key: "Farm_Name", header: "Farm" },
    { key: "Field_Name", header: "Field" },
    { key: "Rep_Number", header: "Rep #" },
    {
      key: "hasGeometry",
      header: "Geometry",
      render: (row: Record<string, unknown>) => (
        <Badge variant={(row as unknown as ZoneRow).hasGeometry ? "default" : "outline"}>
          {(row as unknown as ZoneRow).hasGeometry ? "Yes" : "No"}
        </Badge>
      ),
    },
    {
      key: "_actions",
      header: "",
      render: (row: Record<string, unknown>) => (
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); router.push(`/experiment-zones/${(row as unknown as ZoneRow).id}/edit`); }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      title="Experiment Zones"
      data={data as unknown as Record<string, unknown>[]}
      columns={columns}
      searchKeys={["Zone_Label", "Project_Name", "Farm_Name", "Field_Name"]}
      onAdd={() => router.push("/experiment-zones/new")}
      addLabel="New Zone"
    />
  );
}
