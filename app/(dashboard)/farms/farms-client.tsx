"use client";

import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

interface FarmRow {
  id: number;
  Farm_Name: string | null;
  Farmer_Name: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function FarmsClient({ data, canCreate, activeFilter }: { data: FarmRow[]; canCreate?: boolean; activeFilter?: { projectCount: number; farmCount: number } | null }) {
  const router = useRouter();

  const columns = [
    { key: "Farm_Name", header: "Farm Name", sortable: true },
    { key: "Farmer_Name", header: "Farmer Name", sortable: true },
    {
      key: "is_active",
      header: "Active",
      sortable: true,
      render: (row: Record<string, unknown>) => {
        const active = (row as unknown as FarmRow).is_active;
        return (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              active
                ? "bg-green-100 text-green-700"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {active ? "Active" : "Inactive"}
          </span>
        );
      },
    },
    {
      key: "created_at",
      header: "Date Added",
      sortable: true,
      render: (row: Record<string, unknown>) =>
        formatDate((row as unknown as FarmRow).created_at),
    },
    {
      key: "updated_at",
      header: "Last Modified",
      sortable: true,
      render: (row: Record<string, unknown>) =>
        formatDate((row as unknown as FarmRow).updated_at),
    },
    {
      key: "_actions",
      header: "",
      render: (row: Record<string, unknown>) => (
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/farms/${(row as unknown as FarmRow).id}/edit`);
          }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {activeFilter && activeFilter.farmCount > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Filtered to <strong>{activeFilter.farmCount} farm{activeFilter.farmCount !== 1 ? "s" : ""}</strong>. Change in <strong>Dashboard Filters</strong> (header menu).
        </div>
      )}
      <DataTable
        title="Farms"
        data={data as unknown as Record<string, unknown>[]}
        columns={columns}
        searchKeys={["Farm_Name", "Farmer_Name"]}
        onAdd={canCreate ? () => router.push("/farms/new") : undefined}
        addLabel="New Farm"
        onRowClick={(row) => router.push(`/farms/${(row as unknown as FarmRow).id}`)}
      />
    </div>
  );
}
