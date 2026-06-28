"use client";

import { useRouter } from "next/navigation";
import { format } from "date-fns";
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
  project_name: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by_name: string | null;
}

export function ExperimentsClient({
  data,
  canCreate,
  activeFilter,
}: {
  data: ExperimentRow[];
  canCreate?: boolean;
  activeFilter?: { projectCount: number; farmCount: number } | null;
}) {
  const router = useRouter();

  const columns = [
    { key: "experiment_name", header: "Experiment Name", sortable: true },
    { key: "farm_name", header: "Farm", sortable: true },
    { key: "farmer_name", header: "Farmer", sortable: true },
    { key: "project_name", header: "Project", sortable: true },
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
    {
      key: "created_at",
      header: "Created",
      sortable: true,
      render: (row: Record<string, unknown>) => {
        const val = (row as unknown as ExperimentRow).created_at;
        return val ? format(new Date(val), "MMM d, yyyy") : "—";
      },
    },
    {
      key: "updated_at",
      header: "Updated",
      sortable: true,
      render: (row: Record<string, unknown>) => {
        const val = (row as unknown as ExperimentRow).updated_at;
        return val ? format(new Date(val), "MMM d, yyyy") : "—";
      },
    },
    { key: "created_by_name", header: "Created By", sortable: true },
  ];

  return (
    <div className="space-y-4">
      {activeFilter && (activeFilter.projectCount > 0 || activeFilter.farmCount > 0) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Filtered to{" "}
          {activeFilter.projectCount > 0 && (
            <strong>{activeFilter.projectCount} project{activeFilter.projectCount !== 1 ? "s" : ""}</strong>
          )}
          {activeFilter.projectCount > 0 && activeFilter.farmCount > 0 && ", "}
          {activeFilter.farmCount > 0 && (
            <strong>{activeFilter.farmCount} farm{activeFilter.farmCount !== 1 ? "s" : ""}</strong>
          )}
          . Change in <strong>Dashboard Filters</strong> (header menu).
        </div>
      )}
      <DataTable
        title="Experiments"
        data={data as unknown as Record<string, unknown>[]}
        columns={columns}
        searchKeys={["experiment_name", "farm_name", "farmer_name", "project_name"]}
        onAdd={canCreate ? () => router.push("/experiments/new") : undefined}
        addLabel="New Experiment"
        onRowClick={(row) => {
          const r = row as unknown as ExperimentRow;
          if (r.farm_id) router.push(`/farms/${r.farm_id}/experiments/${r.id}`);
        }}
      />
    </div>
  );
}
