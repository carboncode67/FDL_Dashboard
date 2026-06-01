"use client";

import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

interface TestRow { id: number; Test_Name: string | null; Planned_Date: string | null; Completed_Date: string | null; Cost: number | null; N_Samples: number | null }

export function TestsClient({ data }: { data: TestRow[] }) {
  const router = useRouter();

  const columns = [
    { key: "Test_Name", header: "Test Name" },
    { key: "Planned_Date", header: "Planned Date" },
    { key: "Completed_Date", header: "Completed Date" },
    {
      key: "Cost",
      header: "Cost",
      render: (row: Record<string, unknown>) => {
        const c = (row as unknown as TestRow).Cost;
        return <span>{c != null ? `$${c.toLocaleString()}` : "—"}</span>;
      },
    },
    { key: "N_Samples", header: "N Samples" },
    {
      key: "_actions",
      header: "",
      render: (row: Record<string, unknown>) => (
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); router.push(`/tests/${(row as unknown as TestRow).id}/edit`); }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      title="Tests"
      data={data as unknown as Record<string, unknown>[]}
      columns={columns}
      searchKeys={["Test_Name"]}
      onAdd={() => router.push("/tests/new")}
      addLabel="New Test"
    />
  );
}
