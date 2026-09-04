"use client";

import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";

interface SamplingMapRow {
  id: number;
  farmId: number;
  name: string;
  Farm_Name: string;
  Experiment_Name: string | null;
  polygonCount: number;
  pointCount: number;
  updated_at: string;
}

export function SamplingMapsListClient({ data }: { data: SamplingMapRow[] }) {
  const router = useRouter();

  const columns = [
    { key: "name", header: "Name" },
    { key: "Farm_Name", header: "Farm" },
    {
      key: "Experiment_Name",
      header: "Experiment",
      render: (row: Record<string, unknown>) => {
        const name = (row as unknown as SamplingMapRow).Experiment_Name;
        return name ? name : <Badge variant="outline">Not linked</Badge>;
      },
    },
    { key: "polygonCount", header: "Polygons" },
    { key: "pointCount", header: "Points" },
    {
      key: "updated_at",
      header: "Updated",
      render: (row: Record<string, unknown>) =>
        new Date((row as unknown as SamplingMapRow).updated_at).toLocaleDateString(),
    },
  ];

  return (
    <DataTable
      title="Sampling Maps"
      data={data as unknown as Record<string, unknown>[]}
      columns={columns}
      searchKeys={["name", "Farm_Name", "Experiment_Name"]}
      onRowClick={(row) => {
        const r = row as unknown as SamplingMapRow;
        router.push(`/farms/${r.farmId}/maps/${r.id}`);
      }}
    />
  );
}
