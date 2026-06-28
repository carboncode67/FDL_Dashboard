"use client";

import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

interface FieldRow { id: number; Name: string | null; Farm_Name: string | null; boundary_source: string | null; hasGeometry: boolean }

export function FieldsClient({ data, canCreate, activeFilter }: { data: FieldRow[]; canCreate?: boolean; activeFilter?: { projectCount: number; farmCount: number } | null }) {
  const router = useRouter();

  const columns = [
    { key: "Name", header: "Name" },
    { key: "Farm_Name", header: "Farm" },
    { key: "boundary_source", header: "Boundary Source" },
    {
      key: "hasGeometry",
      header: "Geometry",
      render: (row: Record<string, unknown>) => (
        <Badge variant={(row as unknown as FieldRow).hasGeometry ? "default" : "outline"}>
          {(row as unknown as FieldRow).hasGeometry ? "Yes" : "No"}
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
          onClick={(e) => { e.stopPropagation(); router.push(`/fields/${(row as unknown as FieldRow).id}/edit`); }}
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
        title="Fields"
        data={data as unknown as Record<string, unknown>[]}
        columns={columns}
        searchKeys={["Name", "Farm_Name"]}
        onAdd={canCreate ? () => router.push("/fields/new") : undefined}
        addLabel="New Field"
        onRowClick={(row) => router.push(`/fields/${(row as unknown as FieldRow).id}`)}
      />
    </div>
  );
}
