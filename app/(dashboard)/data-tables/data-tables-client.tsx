"use client";

import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

interface DataTableRowShape {
  id: number;
  name: string;
  description: string | null;
  homeLabel: string;
  columnCount: number;
  usageCount: number;
}

export function DataTablesClient({ data }: { data: DataTableRowShape[] }) {
  const router = useRouter();

  const columns = [
    { key: "name", header: "Name", sortable: true },
    { key: "homeLabel", header: "Home", sortable: true },
    {
      key: "columnCount",
      header: "Columns",
      render: (row: Record<string, unknown>) => {
        const n = (row as unknown as DataTableRowShape).columnCount;
        return <span className="text-slate-500 text-xs">{n}</span>;
      },
    },
    {
      key: "usageCount",
      header: "Used By",
      render: (row: Record<string, unknown>) => {
        const n = (row as unknown as DataTableRowShape).usageCount;
        return n > 0
          ? <Badge variant="outline" className="text-xs">{n} test{n === 1 ? "" : "s"}</Badge>
          : <span className="text-slate-400 text-xs">—</span>;
      },
    },
    {
      key: "_actions",
      header: "",
      render: (row: Record<string, unknown>) => (
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); router.push(`/data-tables/${(row as unknown as DataTableRowShape).id}/edit`); }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      title="Data Tables"
      data={data as unknown as Record<string, unknown>[]}
      columns={columns}
      searchKeys={["name"]}
      onAdd={() => router.push("/data-tables/new")}
      addLabel="New Data Table"
    />
  );
}
