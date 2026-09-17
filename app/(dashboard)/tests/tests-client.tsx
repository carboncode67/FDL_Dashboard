"use client";

import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

interface Assignment { farm_name: string | null; status: string | null }
interface TestRow { id: number; Test_Name: string | null; Cost: number | null; assignments: Assignment[] }

export function TestsClient({ data }: { data: TestRow[] }) {
  const router = useRouter();

  const columns = [
    { key: "Test_Name", header: "Test Name", sortable: true },
    {
      key: "Cost",
      header: "Cost",
      render: (row: Record<string, unknown>) => {
        const c = (row as unknown as TestRow).Cost;
        return <span>{c != null ? `$${c.toLocaleString()}` : "—"}</span>;
      },
    },
    {
      key: "assignments",
      header: "Assigned To",
      render: (row: Record<string, unknown>) => {
        const assignments = (row as unknown as TestRow).assignments;
        if (!assignments.length) return <span className="text-stone-400 text-xs">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {assignments.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs">
                <span>{a.farm_name ?? "Unknown Farm"}</span>
                {a.status && <Badge variant="outline" className="text-xs">{a.status}</Badge>}
              </span>
            ))}
          </div>
        );
      },
    },
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
