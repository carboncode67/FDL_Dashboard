"use client";

import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";

interface ExperimentRow {
  id: number;
  farm_id: number | null;
  experiment_name: string | null;
  farm_name: string | null;
  farmer_name: string | null;
  fields: string | null;
  field_geometries: { id: number; geometry: string }[];
  treatments: string[];
  start_date: string | null;
  end_date: string | null;
}

export function ExperimentsClient({ data, canCreate }: { data: ExperimentRow[]; canCreate?: boolean }) {
  const router = useRouter();

  const columns = [
    { key: "experiment_name", header: "Experiment Name", sortable: true },
    { key: "farm_name", header: "Farm", sortable: true },
    { key: "farmer_name", header: "Farmer", sortable: true },
    { key: "fields", header: "Fields", sortable: true },
    {
      key: "treatments",
      header: "Treatments",
      render: (row: Record<string, unknown>) => {
        const treatments = (row as unknown as ExperimentRow).treatments;
        if (!treatments.length) return <span className="text-slate-400 text-xs">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {treatments.map((t) => (
              <Badge key={t} variant="secondary" className="text-xs">
                {t}
              </Badge>
            ))}
          </div>
        );
      },
    },
    { key: "start_date", header: "Start Date", sortable: true },
    { key: "end_date", header: "End Date", sortable: true },
  ];

  return (
    <DataTable
      title="Experiments"
      data={data as unknown as Record<string, unknown>[]}
      columns={columns}
      searchKeys={["experiment_name", "farm_name", "farmer_name"]}
      onAdd={canCreate ? () => router.push("/experiments/new") : undefined}
      addLabel="New Experiment"
      onRowClick={(row) => {
        const r = row as unknown as ExperimentRow;
        if (r.farm_id) router.push(`/farms/${r.farm_id}/experiments/${r.id}`);
      }}
    />
  );
}
