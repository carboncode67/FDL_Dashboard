"use client";

import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

interface TreatmentRow { id: number; Treatment_Name: string | null; Description: string | null; Notes: string | null }

export function TreatmentsClient({ data }: { data: TreatmentRow[] }) {
  const router = useRouter();

  const columns = [
    { key: "Treatment_Name", header: "Treatment Name" },
    {
      key: "Description",
      header: "Description",
      render: (row: Record<string, unknown>) => (
        <span className="text-slate-600 line-clamp-2 max-w-xs">
          {(row as unknown as TreatmentRow).Description ?? "—"}
        </span>
      ),
    },
    {
      key: "_actions",
      header: "",
      render: (row: Record<string, unknown>) => (
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); router.push(`/treatments/${(row as unknown as TreatmentRow).id}/edit`); }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      title="Treatments"
      data={data as unknown as Record<string, unknown>[]}
      columns={columns}
      searchKeys={["Treatment_Name"]}
      onAdd={() => router.push("/treatments/new")}
      addLabel="New Treatment"
    />
  );
}
