"use client";

import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

const PRIORITY_VARIANT: Record<string, "default" | "outline" | "secondary"> = {
  high:   "default",
  medium: "secondary",
  low:    "outline",
};

interface TemplateRow {
  id:             number;
  description:    string;
  classification: string | null;
  priority:       string;
}

export function TaskTemplatesClient({ data }: { data: TemplateRow[] }) {
  const router = useRouter();

  const columns = [
    { key: "description", header: "Description", sortable: true },
    {
      key: "classification",
      header: "Classification",
      render: (row: Record<string, unknown>) => {
        const c = (row as unknown as TemplateRow).classification;
        return c ? <Badge variant="outline" className="text-xs">{c}</Badge> : <span className="text-slate-400 text-xs">—</span>;
      },
    },
    {
      key: "priority",
      header: "Priority",
      render: (row: Record<string, unknown>) => {
        const p = (row as unknown as TemplateRow).priority;
        return <Badge variant={PRIORITY_VARIANT[p] ?? "outline"} className="text-xs">{p}</Badge>;
      },
    },
    {
      key: "_actions",
      header: "",
      render: (row: Record<string, unknown>) => (
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); router.push(`/task-templates/${(row as unknown as TemplateRow).id}/edit`); }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      title="Task Templates"
      data={data as unknown as Record<string, unknown>[]}
      columns={columns}
      searchKeys={["description", "classification"]}
      onAdd={() => router.push("/task-templates/new")}
      addLabel="New Template"
    />
  );
}
