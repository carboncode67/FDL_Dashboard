"use client";

import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

interface MethodologyRow {
  id: number;
  title: string;
  body: string;
  usageCount: number;
}

export function MethodologiesClient({ data }: { data: MethodologyRow[] }) {
  const router = useRouter();

  const columns = [
    { key: "title", header: "Title", sortable: true },
    {
      key: "body",
      header: "Preview",
      render: (row: Record<string, unknown>) => {
        const b = (row as unknown as MethodologyRow).body;
        return <span className="text-slate-500 text-xs">{b.length > 100 ? `${b.slice(0, 100)}…` : b}</span>;
      },
    },
    {
      key: "usageCount",
      header: "Used By",
      render: (row: Record<string, unknown>) => {
        const n = (row as unknown as MethodologyRow).usageCount;
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
          onClick={(e) => { e.stopPropagation(); router.push(`/methodologies/${(row as unknown as MethodologyRow).id}/edit`); }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      title="Methodologies"
      data={data as unknown as Record<string, unknown>[]}
      columns={columns}
      searchKeys={["title"]}
      onAdd={() => router.push("/methodologies/new")}
      addLabel="New Methodology"
    />
  );
}
