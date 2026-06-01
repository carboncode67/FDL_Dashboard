"use client";

import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

interface ProjectRow {
  id: number;
  Project_Name: string | null;
  Status: string | null;
  Year_Started: number | null;
  Total_Budget: number | null;
}

const statusVariant = (status: string | null) => {
  if (status === "Active") return "default";
  if (status === "Completed") return "secondary";
  return "outline";
};

export function ProjectsClient({ data }: { data: ProjectRow[] }) {
  const router = useRouter();

  const columns = [
    {
      key: "Project_Name",
      header: "Name",
      render: (row: Record<string, unknown>) => (
        <span className="font-medium">{(row as unknown as ProjectRow).Project_Name ?? `Project #${(row as unknown as ProjectRow).id}`}</span>
      ),
    },
    {
      key: "Status",
      header: "Status",
      render: (row: Record<string, unknown>) => (
        <Badge variant={statusVariant((row as unknown as ProjectRow).Status)}>{(row as unknown as ProjectRow).Status ?? "Unknown"}</Badge>
      ),
    },
    {
      key: "Year_Started",
      header: "Year Started",
      render: (row: Record<string, unknown>) => <span>{(row as unknown as ProjectRow).Year_Started ?? "—"}</span>,
    },
    {
      key: "Total_Budget",
      header: "Total Budget",
      render: (row: Record<string, unknown>) => {
        const b = (row as unknown as ProjectRow).Total_Budget;
        return b != null ? <span>${b.toLocaleString()}</span> : <span>—</span>;
      },
    },
    {
      key: "_actions",
      header: "",
      render: (row: Record<string, unknown>) => (
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); router.push(`/projects/${(row as unknown as ProjectRow).id}/edit`); }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      title="Projects"
      data={data as unknown as Record<string, unknown>[]}
      columns={columns as unknown as { key: string; header: string; render?: (row: Record<string, unknown>) => React.ReactNode }[]}
      searchKeys={["Project_Name", "Status"]}
      onAdd={() => router.push("/projects/new")}
      addLabel="New Project"
      onRowClick={(row) => router.push(`/projects/${(row as unknown as ProjectRow).id}`)}
    />
  );
}
